import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import twilio from "twilio";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const client = twilio(
  "AC300561119168fbc491e200da794c7b53",
  "0ea9e4c4e51f7e5bc5265fa50fa6ea18"
);

app.post("/send-sms", async (req, res) => {
  const { to, body } = req.body;
  if (!to || !body)
    return res.status(400).json({ success: false, error: "Missing to/body" });

  try {
    const message = await client.messages.create({
      body,
      from: "+12295856937", // Must be your Twilio number
      to,
    });
    res.json({ success: true, sid: message.sid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(4000, () =>
  console.log("SMS server running on http://localhost:4000")
);
