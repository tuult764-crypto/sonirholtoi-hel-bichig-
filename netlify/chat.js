const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  const { prompt } = JSON.parse(event.body);
  const api_key = process.env.OPENAI_API_KEY; // Netlify-д хадгалсан нууц үг

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${api_key}`
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await response.json();
  return {
    statusCode: 200,
    body: JSON.stringify(data)
  };
};
