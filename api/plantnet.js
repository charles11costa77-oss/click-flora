// Função serverless (Vercel) — identifica a planta via PlantNet
// A chave da API fica só aqui no servidor, nunca é exposta ao navegador.
// Configurar no painel do Vercel: Settings > Environment Variables > PLANTNET_API_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const apiKey = process.env.PLANTNET_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Chave PlantNet não configurada no servidor' });
  }

  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'Imagem não enviada' });
    }

    const matches = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: 'Formato de imagem inválido' });
    }
    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');

    const boundary = '----ClickFloraBoundary' + Date.now();
    const ext = mimeType.split('/')[1] || 'jpg';

    const formParts = [];
    formParts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="images"; filename="foto.${ext}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`
    ));
    formParts.push(buffer);
    formParts.push(Buffer.from(`\r\n--${boundary}\r\n`));
    formParts.push(Buffer.from(
      `Content-Disposition: form-data; name="organs"\r\n\r\nauto\r\n`
    ));
    formParts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(formParts);

    const plantnetUrl = `https://my-api.plantnet.org/v2/identify/all?api-key=${apiKey}`;

    const response = await fetch(plantnetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || 'Não foi possível identificar a planta',
      });
    }

    const best = data.results && data.results[0];
    if (!best) {
      return res.status(200).json({ found: false });
    }

    return res.status(200).json({
      found: true,
      score: best.score,
      scientificName: best.species?.scientificNameWithoutAuthor || null,
      commonNames: best.species?.commonNames || [],
      family: best.species?.family?.scientificNameWithoutAuthor || null,
      genus: best.species?.genus?.scientificNameWithoutAuthor || null,
    });
  } catch (err) {
    console.error('Erro PlantNet:', err);
    return res.status(500).json({ error: 'Erro interno ao identificar a planta' });
  }
}
