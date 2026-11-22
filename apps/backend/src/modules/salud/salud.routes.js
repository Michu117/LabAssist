const { Router } = require("express");

const router = Router();

router.get("/", (req, res) => {
  res.status(200).json({ ok: true, data: { estado: "ok" } });
});

module.exports = router;
