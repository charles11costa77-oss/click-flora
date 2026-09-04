// Função serverless (Vercel) — identifica a planta via PlantNet
// A chave da API fica só aqui no servidor, nunca é exposta ao navegador.
// Configurar no painel do Vercel: Settings > Environment Variables > PLANTNET_API_KEY

export default async function handler(req, res) {
  const apiLangGlobal = req.body?.lang === 'en' ? 'en' : 'pt';
  const MSG = {
    pt: {
      method: 'Método não permitido',
      noKey: 'Chave PlantNet não configurada no servidor',
      noImage: 'Imagem não enviada',
      badFormat: 'Formato de imagem inválido',
      notFound: 'Não foi possível identificar a planta',
      internal: 'Erro interno ao identificar a planta',
    },
    en: {
      method: 'Method not allowed',
      noKey: 'PlantNet key not configured on the server',
      noImage: 'No image sent',
      badFormat: 'Invalid image format',
      notFound: 'Could not identify the plant',
      internal: 'Internal error identifying the plant',
    }
  }[apiLangGlobal];

  if (req.method !== 'POST') {
    return res.status(405).json({ error: MSG.method });
  }

  const apiKey = process.env.PLANTNET_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: MSG.noKey });
  }

  try {
    const { imageBase64, lang } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: MSG.noImage });
    }
    const apiLang = lang === 'en' ? 'en' : 'pt';

    const matches = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: MSG.badFormat });
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

    const plantnetUrl = `https://my-api.plantnet.org/v2/identify/all?api-key=${apiKey}&lang=${apiLang}`;

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
        error: data.message || MSG.notFound,
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
    return res.status(500).json({ error: MSG.internal });
  }
} 
