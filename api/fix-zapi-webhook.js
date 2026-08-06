// api/fix-zapi-webhook.js
//
// Ferramenta de uso único: força, direto pela API da Z-API, que o webhook
// "ao receber (incluindo enviadas por mim)" aponte pro endereço certo do
// nosso sistema. Faz isso pela API pra não depender de achar o botão certo
// no painel visual da Z-API (que muda de lugar entre versões).
//
// Depois de rodar uma vez com sucesso, esse arquivo pode ser apagado.

module.exports = async function handler(req, res) {
  try {
    const { ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN } = process.env;
    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN) {
      return res.status(500).json({ error: 'faltam variáveis ZAPI_INSTANCE_ID / ZAPI_TOKEN / ZAPI_CLIENT_TOKEN na Vercel' });
    }

    const webhookUrl = 'https://qualify2-0.vercel.app/api/webhook/zapi';
    const zapiUrl = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/update-webhook-received-delivery`;

    const zapiRes = await fetch(zapiUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': ZAPI_CLIENT_TOKEN,
      },
      body: JSON.stringify({ value: webhookUrl }),
    });

    const zapiData = await zapiRes.json().catch(() => ({}));

    return res.status(200).json({
      ok: zapiRes.ok,
      status_da_zapi: zapiRes.status,
      resposta_da_zapi: zapiData,
      webhook_configurado_para: webhookUrl,
      mensagem: zapiRes.ok
        ? 'Configurado! Agora manda uma mensagem de teste do celular pra um lead individual e confere os Logs da Vercel de novo.'
        : 'A Z-API recusou. Olha o campo "resposta_da_zapi" acima pra ver o motivo exato.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'erro interno', details: err.message });
  }
};
