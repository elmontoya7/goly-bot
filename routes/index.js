let express = require('express');
let router = express.Router();

router.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === "enterprise") {
      //IF FB TOKEN -> RETURN 200
      res.status(200).send(req.query['hub.challenge']);
  } else {
      //LOG ERROR FOR WRONG TOKEN
      console.error("Token no válido. Consultar -verify_token- en configuración de webhook.");
      res.sendStatus(403);
  }
});

router.post('/webhook', (req, res) => {
  console.log(JSON.stringify(req.body));
  res.status(200).send('OK HTTPS');
});

module.exports = router;
