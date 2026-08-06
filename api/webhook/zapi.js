// api/webhook/zapi.js
//
// Esse arquivo é o "portão de entrada" do WhatsApp.
// A Z-API vai chamar essa URL toda vez que uma mensagem chegar ou sair
// do seu número. A função salva a mensagem no Supabase, criando o lead
// automaticamente se for um número novo.
//
// Variáveis de ambiente necessárias na Vercel:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (pegue em Supabase > Project Settings > API > service_role)

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Extrai os dados que importam de um payload de webhook da Z-API.
// Retorna null quando o evento não é uma mensagem de conversa real
// (ex: notificação de etiqueta, reação, evento de grupo).
function parseZapiPayload(body) {
  if (!body || typeof body !== 'object') return null;
  if (body.isGroup === true) return null;
  if (body.notification || body.reaction) return null;
  if (!body.phone) return null;

  const direction = body.fromMe === true ? 'out' : 'in';

  let content = null;
  let media_url = null;
  let media_type = null;

  if (body.text && body.text.message) {
    content = body.text.message;
  } else if (body.image) {
    content = body.image.caption || null;
    media_url = body.image.imageUrl || null;
    media_type = 'image';
  } else if (body.audio) {
    media_url = body.audio.audioUrl || null;
    media_type = 'audio';
  } else if (body.video) {
    content = body.video.caption || null;
    media_url = body.video.videoUrl || null;
    media_type = 'video';
  } else if (body.document) {
    content = body.document.caption || null;
    media_url = body.document.documentUrl || null;
    media_type = 'document';
  }

  if (!content && !media_url) return null;

  return {
    phone: body.phone,
    direction,
    content,
    media_url,
    media_type,
    z_api_message_id: body.messageId || null,
    sender_name: body.senderName || null,
    created_at: body.momment ? new Date(body.momment).toISOString() : new Date().toISOString(),
  };
}

// Acha o lead pelo telefone, ou cria um novo se for a primeira vez.
// Protegido contra a corrida de duas mensagens quase simultâneas de um
// número novo (ver constraint "unique" em leads.phone no schema).
async function findOrCreateLead(phone, senderName) {
  const { data: existing } = await supabase
    .from('leads')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from('leads')
    .insert({ phone, name: senderName || null, source: 'whatsapp' })
    .select('id')
    .single();

  if (error) {
    // 23505 = violação de unicidade: outra mensagem quase simultânea já criou o lead
    if (error.code === '23505') {
      const { data: retry } = await supabase
        .from('leads')
        .select('id')
        .eq('phone', phone)
        .maybeSingle();
      if (retry) return retry.id;
    }
    throw error;
  }

  return created.id;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  // --- LOG TEMPORÁRIO DE DIAGNÓSTICO ---
  // Isso aparece na aba "Logs" do projeto na Vercel. Depois de resolvermos
  // o problema, dá pra tirar essas duas linhas (ou deixar, não atrapalha).
  console.log('ZAPI webhook recebido:', JSON.stringify(req.body));

  try {
    const parsed = parseZapiPayload(req.body);
    console.log('ZAPI resultado do parser:', JSON.stringify(parsed));

    // Evento que não é mensagem de conversa (reação, notificação, grupo) -- ignora
    // mas responde 200 pra Z-API não ficar tentando de novo.
    if (!parsed) {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const leadId = await findOrCreateLead(parsed.phone, parsed.sender_name);

    const { error: msgError } = await supabase
      .from('messages')
      .upsert(
        {
          lead_id: leadId,
          direction: parsed.direction,
          content: parsed.content,
          media_url: parsed.media_url,
          media_type: parsed.media_type,
          z_api_message_id: parsed.z_api_message_id,
          created_at: parsed.created_at,
        },
        { onConflict: 'z_api_message_id', ignoreDuplicates: true }
      );

    if (msgError) throw msgError;

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Erro no webhook da Z-API:', err);
    // Responde 200 mesmo assim pra Z-API não ficar reenviando o mesmo evento em loop;
    // o erro fica registrado no log da Vercel pra você investigar depois.
    return res.status(200).json({ ok: false, error: 'internal error logged' });
  }
};
