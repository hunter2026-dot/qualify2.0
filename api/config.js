// api/config.js
//
// Esse endpoint devolve pro navegador só os dados "seguros de mostrar"
// (URL do projeto + chave publishable). A chave secreta (sb_secret_...)
// NUNCA passa por aqui -- ela só é usada no webhook (zapi.js), que roda
// só no servidor.

module.exports = function handler(req, res) {
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
  });
};
