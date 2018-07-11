let express = require('express');
let router = express.Router();

router.post('/webhook', (req, res) => {
  console.log(JSON.stringify(req.body));
  res.json({response: 'Ok'});
});

module.exports = router;
