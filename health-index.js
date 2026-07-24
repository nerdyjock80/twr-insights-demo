module.exports = async function (context, req) {
  const azureConfigured = Boolean(process.env.AZURE_LANG_ENDPOINT && process.env.AZURE_LANG_KEY);
  context.res = { status: 200, body: { ok: true, azureConfigured } };
};
