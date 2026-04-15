require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// CORS para permitir o iframe
app.use(cors());
app.use(express.json());

// SERVE OS ARQUIVOS DA PASTA PUBLIC
app.use(express.static(path.join(__dirname, 'public')));

// ROTA PARA TESTAR SE O SERVIDOR ESTÁ NO AR
app.get('/health', (req, res) => {
  res.json({ status: 'ok', server: 'controle-frete' });
});

// TODAS AS OUTRAS ROTAS QUE NÃO FORAM ENCONTRADAS
app.use('*', (req, res) => {
  // Se for arquivo .js ou .css, retorna 404
  if (req.path.match(/\.(js|css)$/)) {
    return res.status(404).send('Arquivo não encontrado');
  }
  // Qualquer outra rota, serve o index.html
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`✅ Controle de Frete rodando na porta ${port}`);
  console.log(`📁 Servindo arquivos de: ${path.join(__dirname, 'public')}`);
});
