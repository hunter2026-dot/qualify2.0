// api/send-message.js
//
// Chamado pelo painel de chat quando você digita uma resposta e clica
// em "Enviar". Manda a mensagem de verdade pela Z-API e já salva no
// histórico -- não precisa esperar o webhook confirmar (o webhook
// também vai tentar salvar a mesma mensagem depois, mas o índice
// "dedup" impede duplicar).
//
// Variáveis de ambiente necessárias na Vercel:
//   ZAPI_INSTANCE_ID
//   ZAPI_TOKEN
//   ZAPI_CLIENT_TOKEN     (o "Client-Token" / token de segurança da conta Z-API)
//   SUPABASE_URL           (já configurada na Etapa 2)
//   SUPABASE_SERVICE_ROLE_KEY  (já configurada na Etapa 2)

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  try {
    const { leadId, phone, message } = req.body || {};

    if (!leadId || !phone || !message || !message.trim()) {
      return res.status(400).json({ error: 'faltam dados: leadId, phone e message são obrigatórios' });
    }

    const { ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN } = process.env;
    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN) {
      return res.status(500).json({ error: 'faltam variáveis ZAPI_INSTANCE_ID / ZAPI_TOKEN / ZAPI_CLIENT_TOKEN na Vercel' });
    }

    const zapiUrl = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;

    const zapiRes = await fetch(zapiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': ZAPI_CLIENT_TOKEN,
      },
      body: JSON.stringify({ phone, message }),
    });

    const zapiData = await zapiRes.json();

    if (!zapiRes.ok) {
      return res.status(502).json({ error: 'Z-API recusou o envio', details: zapiData });
    }

    const { error: msgError } = await supabase
      .from('messages')
      .upsert(
        {
          lead_id: leadId,
          direction: 'out',
          content: message,
          z_api_message_id: zapiData.messageId || zapiData.id || null,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'z_api_message_id', ignoreDuplicates: true }
      );

    if (msgError) throw msgError;

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err);
    return res.status(500).json({ error: 'erro interno ao enviar' });
  }
};
