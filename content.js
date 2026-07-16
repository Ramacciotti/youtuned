(() => {
  // Define os elementos e atributos que normalmente representam blocos de Shorts no YouTube.
  // Seletores focados apenas em elementos que explicitamente representam Shorts.
  // Evitamos selecionar renderers genéricos (como ytd-rich-shelf-renderer) para não
  // esconder prateleiras inteiras da página inicial que não são exclusivamente Shorts.
  const seletoresParaEsconder = [
    'a[href*="/shorts/"]',
    'ytd-reel-shelf-renderer',
    'ytd-reel-video-renderer',
    'ytd-reel-item-renderer',
    '[is-shorts]'
  ];

  // Define o identificador do badge que será usado para mostrar o contador de dislikes.
  const idDoBadgeDeDislikes = 'youtube-dislike-restorer-badge';

  // Define a URL da API pública usada para recuperar a contagem de dislikes.
  const urlDaApiDeDislikes = 'https://returnyoutubedislikeapi.com/votes';

  // Função responsável por esconder os elementos que representam Shorts no DOM atual.
  function esconderShortsNoDOM() {
    const elementosEncontrados = document.querySelectorAll(seletoresParaEsconder.join(','));
    elementosEncontrados.forEach(aplicarRegraNoElemento);
  }

  // Função que aplica a regra de ocultação em um elemento específico e nos seus containers principais.
  function aplicarRegraNoElemento(elemento) {
    if (!elemento || elemento.dataset.shortsHidden === 'true') {
      return;
    }

    const link = (elemento.getAttribute('href') || '').toLowerCase();
    const texto = (elemento.textContent || '').toLowerCase();
    const temShorts = link.includes('/shorts/') || texto.includes('shorts');

    // Se não encontramos indícios óbvios de Shorts no link ou no texto, descartamos.
    if (!temShorts && !elemento.matches(seletoresParaEsconder.join(','))) {
      return;
    }

    // Escolhe um alvo seguro para esconder: preferimos um renderer de item/reel
    // em vez de um shelf genérico. Isso evita remover toda a grade da home.
    const alvo = elemento.closest('ytd-reel-item-renderer, ytd-reel-shelf-renderer, ytd-compact-video-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer') || elemento;
    // Se o alvo for uma prateleira genérica (pouco provável aqui), escondemos apenas o elemento encontrado.
    const tag = (alvo && alvo.tagName || '').toLowerCase();
    const esconderElemento = tag === 'ytd-reel-shelf-renderer' || tag.endsWith('reel-item-renderer') || alvo === elemento;
    const nodeParaEsconder = esconderElemento ? elemento : alvo;
    if (nodeParaEsconder) {
      nodeParaEsconder.style.setProperty('display', 'none', 'important');
      nodeParaEsconder.setAttribute('aria-hidden', 'true');
      nodeParaEsconder.dataset.shortsHidden = 'true';
    }
  }

  // Função que injeta uma regra CSS global para esconder Shorts mesmo antes do processamento do JavaScript.
  function esconderShortsPorCSS() {
    if (document.getElementById('youtube-shorts-remover-style')) {
      return;
    }

    const estilo = document.createElement('style');
    estilo.id = 'youtube-shorts-remover-style';
    // Injeta apenas seletores explicitamente ligados a Shorts. Não remover prateleiras
    // genéricas sem checagem evita que a home fique vazia.
    estilo.textContent = `
      ytd-reel-shelf-renderer,
      ytd-reel-video-renderer,
      ytd-reel-item-renderer,
      a[href*="/shorts/"] {
        display: none !important;
      }
    `;
    document.head.appendChild(estilo);
  }

  // Função que limpa containers vazios após a ocultação dos blocos de Shorts.
  function limparItensVazios() {
    // Remove apenas containers que ficaram vazios (sem filhos visíveis) para
    // não causar remoção de blocos inteiros que podem ter sido incorretamente marcados.
    const containers = document.querySelectorAll('ytd-rich-item-renderer, ytd-rich-shelf-renderer, ytd-reel-shelf-renderer');
    containers.forEach((container) => {
      // Conta filhos visíveis
      const filhosVisiveis = Array.from(container.children).some((c) => {
        return c.offsetParent !== null && getComputedStyle(c).display !== 'none';
      });
      if (!filhosVisiveis) {
        container.remove();
      }
    });
  }

  // Função que cria um observador para acompanhar as mudanças dinâmicas da página do YouTube.
  function iniciarObservador() {
    if (window.__youtubeShortsObserver) {
      return;
    }

    const observador = new MutationObserver(() => {
      esconderShortsNoDOM();
      limparItensVazios();
      restaurarDislikes();
    });

    observador.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });

    window.__youtubeShortsObserver = observador;
  }

  // Função que verifica se a página atual é uma página de vídeo do YouTube.
  function ePaginaDeVideo() {
    const parametrosDaUrl = new URLSearchParams(window.location.search);
    return window.location.pathname === '/watch' && Boolean(parametrosDaUrl.get('v'));
  }

  // Função que transforma os valores numéricos em texto com separadores legíveis.
  function formatarNumero(valor) {
    return new Intl.NumberFormat('pt-BR').format(Number(valor) || 0);
  }

  // Função que cria ou atualiza o badge visual que mostra o número de dislikes.
  function mostrarBadgeDeDislikes(dislikes) {
    if (!ePaginaDeVideo()) {
      return;
    }

    const container = document.querySelector('#top-level-buttons-computed, ytd-menu-renderer, #actions');
    if (!container) {
      return;
    }

    let badge = document.getElementById(idDoBadgeDeDislikes);
    if (!badge) {
      badge = document.createElement('span');
      badge.id = idDoBadgeDeDislikes;
      badge.style.cssText = 'display:inline-flex; align-items:center; margin-left:8px; padding:6px 10px; border-radius:999px; background:var(--yt-spec-badge-chip-background); color:var(--yt-spec-text-primary); font-size:12px; font-weight:600;';
      container.appendChild(badge);
    }

    badge.textContent = `↓ ${formatarNumero(dislikes)}`;
  }

  // Função que busca a contagem de dislikes diretamente em uma API pública.
  async function buscarContagemDeDislikes() {
    if (!ePaginaDeVideo()) {
      return;
    }

    const parametrosDaUrl = new URLSearchParams(window.location.search);
    const videoId = parametrosDaUrl.get('v');
    if (!videoId) {
      return;
    }

    try {
      const resposta = await fetch(`${urlDaApiDeDislikes}?videoId=${encodeURIComponent(videoId)}`, {
        headers: {
          Accept: 'application/json'
        }
      });

      if (!resposta.ok) {
        throw new Error('Falha ao buscar dislikes');
      }

      const dados = await resposta.json();
      // Se receber dados, tentamos mostrar counts tanto no badge quanto nos botões do vídeo.
      const likes = typeof dados.likes === 'number' ? dados.likes : null;
      const dislikes = typeof dados.dislikes === 'number' ? dados.dislikes : null;
      if (dislikes != null || likes != null) {
        mostrarBadgeDeDislikes(dislikes);
        mostrarContadoresNosBotoes(likes, dislikes);
      }
    } catch (erro) {
      console.warn('Não foi possível restaurar o contador de dislikes.', erro);
    }
  }

  // Helpers inspirados na extensão de referência para localizar os botões e
  // injetar os contadores de likes/dislikes no layout do vídeo.
  function getButtons() {
    const menuContainer = document.getElementById('menu-container');
    if (menuContainer?.offsetParent === null) {
      return (
        document.querySelector('ytd-menu-renderer.ytd-watch-metadata > div') ||
        document.querySelector('ytd-menu-renderer.ytd-video-primary-info-renderer > div')
      );
    }
    return menuContainer?.querySelector('#top-level-buttons-computed');
  }

  function getDislikeButton() {
    const buttons = getButtons();
    if (!buttons) return null;
    const firstChild = buttons.children[0];
    if (firstChild?.tagName === 'YTD-SEGMENTED-LIKE-DISLIKE-BUTTON-RENDERER') {
      return document.querySelector('#segmented-dislike-button') || firstChild.children[1];
    }
    if (buttons.querySelector('segmented-like-dislike-button-view-model')) {
      return buttons.querySelector('dislike-button-view-model');
    }
    return buttons.children[1] || null;
  }

  function getLikeButton() {
    const buttons = getButtons();
    if (!buttons) return null;
    const firstChild = buttons.children[0];
    const tag = 'YTD-SEGMENTED-LIKE-DISLIKE-BUTTON-RENDERER';
    if (firstChild?.tagName === tag) {
      return document.querySelector('#segmented-like-button') || firstChild.children[0];
    }
    if (buttons.querySelector('segmented-like-dislike-button-view-model')) {
      return buttons.querySelector('like-button-view-model');
    }
    return buttons.querySelector('like-button-view-model') || buttons.children[0];
  }

  function getTextElement(button) {
    if (!button) return null;
    return button.querySelector('#text, yt-formatted-string, .button-renderer-text, span[role="text"]');
  }

  function createTextElement(button) {
    const textSpan = document.createElement('span');
    // Reaproveita um elemento de texto existente, se houver, para evitar duplicação.
    const existing = button.querySelector('#text, yt-formatted-string, .button-renderer-text, span[role="text"]');
    if (existing) return existing;
    textSpan.id = 'text';
    textSpan.style.marginLeft = '6px';
    const btn = button.querySelector('button');
    if (btn) {
      btn.appendChild(textSpan);
      btn.style.width = 'auto';
    }
    return textSpan;
  }

  function formatNumber(count) {
    return new Intl.NumberFormat('pt-BR', { notation: 'compact', compactDisplay: 'short' }).format(count);
  }

  function mostrarContadoresNosBotoes(likes, dislikes) {
    // Apenas atualiza o botão de dislike — removemos qualquer escrita no botão de like.
    const dislikeButton = getDislikeButton();
    if (dislikeButton) {
      let textEl = getTextElement(dislikeButton);
      if (!textEl) textEl = createTextElement(dislikeButton);
      if (textEl && dislikes != null) textEl.textContent = formatNumber(dislikes);
    }
  }

  // Função que tenta restaurar o contador de dislikes quando o layout do vídeo estiver disponível.
  function restaurarDislikes() {
    if (!ePaginaDeVideo()) {
      return;
    }

    const container = document.querySelector('#top-level-buttons-computed, ytd-menu-renderer, #actions');
    if (!container) {
      window.setTimeout(restaurarDislikes, 1000);
      return;
    }

    buscarContagemDeDislikes();
  }

  // Função que inicializa a extensão e executa o processo de ocultação em cascata.
  function iniciarExtensao() {
    esconderShortsPorCSS();
    esconderShortsNoDOM();
    limparItensVazios();
    iniciarObservador();
    restaurarDislikes();
    iniciarProcessamentoDeThumbnails();
  }

  // Garante que a extensão rode quando a navegação do YouTube terminar de carregar a página.
  document.addEventListener('yt-navigate-finish', iniciarExtensao, { once: false });
  window.addEventListener('load', iniciarExtensao, { once: true });
  iniciarExtensao();
})();

// =====================
// Thumbnails: likes/dislikes
// =====================

(function () {
  // Cache local para votos recuperados de forma a reduzir requisições.
  const CACHE_KEY = 'youtuned_votes_cache_v1';
  const VOTES_API = 'https://returnyoutubedislikeapi.com/votes?videoId=';

  function loadVotesCache() {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveVotesCache(cache) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {}
  }

  // Extrai videoId de um href que pode ser /watch?v= ou /shorts/ID
  function extrairVideoIdDeHref(href) {
    try {
      const url = new URL(href, location.origin);
      if (url.pathname.startsWith('/shorts/')) {
        return url.pathname.split('/shorts/')[1];
      }
      return url.searchParams.get('v');
    } catch {
      const m = href.match(/v=([a-zA-Z0-9_-]{6,})/);
      if (m) return m[1];
      const s = href.match(/\/shorts\/([a-zA-Z0-9_-]{6,})/);
      return s ? s[1] : null;
    }
  }

  // Faz fetch das contagens de likes/dislikes via API pública.
  async function fetchVotes(videoId) {
    if (!videoId) return null;
    const cache = loadVotesCache();
    if (cache[videoId]) return cache[videoId];
    try {
      const res = await fetch(VOTES_API + encodeURIComponent(videoId), { headers: { Accept: 'application/json' } });
      if (!res.ok) return null;
      const data = await res.json();
      const votes = { likes: data.likes || null, dislikes: data.dislikes || null };
      cache[videoId] = votes;
      saveVotesCache(cache);
      return votes;
    } catch (e) {
      return null;
    }
  }

  // Cria um badge pequeno e legível para a thumbnail com likes/dislikes.
  function criarBadgeDeThumbnail(likes, dislikes) {
    const badge = document.createElement('div');
    badge.className = 'youtuned-vote-badge';
    badge.style.cssText = 'position:absolute; left:6px; bottom:6px; z-index:9999; background:rgba(0,0,0,0.7); color:#fff; padding:4px 6px; border-radius:12px; font-size:11px; display:inline-flex; gap:8px; align-items:center; font-weight:600;';
    const likesSpan = document.createElement('span');
    likesSpan.textContent = likes != null ? `👍 ${Intl.NumberFormat('pt-BR').format(likes)}` : '';
    const dislikesSpan = document.createElement('span');
    dislikesSpan.textContent = dislikes != null ? `👎 ${Intl.NumberFormat('pt-BR').format(dislikes)}` : '';
    badge.appendChild(likesSpan);
    if (likes != null && dislikes != null) badge.appendChild(dislikesSpan);
    return badge;
  }

  // Processa um elemento de thumbnail: extrai id, busca votes e injeta badge.
  async function processThumbnail(anchor) {
    if (!anchor || anchor.dataset.youtunedProcessed === 'true') return;
    const href = anchor.getAttribute('href') || '';
    const videoId = extrairVideoIdDeHref(href);
    if (!videoId) return;
    anchor.dataset.youtunedProcessed = 'true';

    // Encontra o container visual da thumbnail para posicionar o badge.
    const container = anchor.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytm-rich-item-renderer, ytm-grid-video-renderer') || anchor;
    if (!container) return;
    // Garante que o container permita posicionamento absoluto do badge.
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    const cache = loadVotesCache();
    const votes = cache[videoId] || await fetchVotes(videoId);
    if (!votes) return;

    const badge = criarBadgeDeThumbnail(votes.likes, votes.dislikes);
    // Remove badge antigo se existir
    const existente = container.querySelector('.youtuned-vote-badge');
    if (existente) existente.remove();
    container.appendChild(badge);
  }

  // Varre todas thumbnails na página e processa as que encontrara.
  function processAllThumbnails() {
    // Seleciona links que levam a vídeos ou shorts corretamente.
    const anchors = Array.from(document.querySelectorAll('a[href*="/watch?v="], a[href*="/shorts/"]'));
    anchors.forEach((a) => processThumbnail(a));
  }

  let thumbnailObserver = null;

  // Inicia observador para detectar novas thumbnails dinamicamente.
  function iniciarProcessamentoDeThumbnails() {
    processAllThumbnails();
    if (thumbnailObserver) return;
    thumbnailObserver = new MutationObserver(() => {
      processAllThumbnails();
    });
    thumbnailObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  // Expor função global para ser chamada no flow principal.
  window.iniciarProcessamentoDeThumbnails = iniciarProcessamentoDeThumbnails;
})();
