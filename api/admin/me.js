const { requireAdmin } = require("../_lib/admin-guard");

module.exports = async (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  res.status(200).json({ ok: true });
};
