// ==UserScript==
// @name         YouTube Shorts Remover
// @namespace    https://github.com/
// @version      1.0.0
// @description  Remove blocos de Shorts do YouTube e restaura o contador de dislikes em navegadores com userscript.
// @match        *://*.youtube.com/*
// @match        *://youtube.com/*
// @match        *://m.youtube.com/*
// @grant        none
// ==/UserScript==

(function () {
  let domWorkTimer = null;
  let thumbnailProcessTimer = null;
  const DOM_WORK_DEBOUNCE_MS = 120;
  const THUMBNAIL_PROCESS_DEBOUNCE_MS = 250;

  // Define os seletores que normalmente representam Shorts na interface do YouTube.
  const seletoresParaEsconder = [
    'a[href*="/shorts/"]',
    'ytd-reel-shelf-renderer',
    'ytd-reel-video-renderer',
    '[is-shorts]'
  ];

  // Define o identificador do badge que será usado para mostrar o contador de dislikes.
  const idDoBadgeDeDislikes = 'youtube-dislike-restorer-badge';

  // Define a URL da API pública usada para recuperar a contagem de dislikes.
  const urlDaApiDeDislikes = 'https://returnyoutubedislikeapi.com/votes';

  // Função responsável por esconder qualquer bloco que pareça ser um Short no DOM atual.
  function esconderShortsNoDOM() {
    document.querySelectorAll(seletoresParaEsconder.join(',')).forEach((elemento) => {
      const alvo = elemento.closest('ytd-rich-item-renderer, ytd-rich-shelf-renderer, ytd-reel-shelf-renderer, ytd-compact-video-renderer, ytd-video-renderer') || elemento;
      alvo.style.display = 'none !important';
      alvo.style.setProperty('display', 'none', 'important');
      alvo.setAttribute('aria-hidden', 'true');
    });
  }

  function removerDescobertaAvancadaDeTemas() {
    document.querySelectorAll('ytd-chips-shelf-with-video-shelf-renderer').forEach((elemento) => {
      const texto = (elemento.textContent || '').toLowerCase();
      if (!texto.includes('descoberta avançada de novos temas')) {
        return;
      }
      const alvo = elemento.closest('ytd-chips-shelf-with-video-shelf-renderer') || elemento;
      alvo.style.setProperty('display', 'none', 'important');
      alvo.setAttribute('aria-hidden', 'true');
    });
  }

  // Função que injeta uma regra CSS para remover Shorts antes que o conteúdo seja exibido.
  function aplicarCSSGlobal() {
    if (document.getElementById('youtube-shorts-remover-style')) {
      return;
    }

    const estilo = document.createElement('style');
    estilo.id = 'youtube-shorts-remover-style';
    estilo.textContent = `
      ytd-reel-shelf-renderer,
      ytd-reel-video-renderer,
      a[href*="/shorts/"] {
        display: none !important;
      }
    `;
    document.head.appendChild(estilo);
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

  function scheduleDomWork() {
    if (domWorkTimer) {
      return;
    }

    domWorkTimer = window.setTimeout(() => {
      domWorkTimer = null;
      esconderShortsNoDOM();
      removerDescobertaAvancadaDeTemas();
      restaurarDislikes();
    }, DOM_WORK_DEBOUNCE_MS);
  }

  // Função que cria um observador para acompanhar mudanças dinâmicas na página após navegação.
  function iniciarObservador() {
    const observador = new MutationObserver(() => {
      scheduleDomWork();
    });

    observador.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  // Função principal que inicializa a remoção de Shorts e a restauração de dislikes de forma escalonada.
  function iniciarExtensao() {
    aplicarCSSGlobal();
    esconderShortsNoDOM();
    removerDescobertaAvancadaDeTemas();
    iniciarObservador();
    restaurarDislikes();
    iniciarProcessamentoDeThumbnails();
  }

  document.addEventListener('yt-navigate-finish', iniciarExtensao, { once: false });
  window.addEventListener('load', iniciarExtensao, { once: true });
  iniciarExtensao();
})();

// =====================
// Thumbnails: likes/dislikes (userscript)
// =====================

(function () {
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

  function criarBadgeDeThumbnail(likes, dislikes, container) {
    // Determina tema (semelhante à versão da extensão)
    function isDark(container) {
      try {
        const html = document.documentElement;
        if (html.hasAttribute('dark')) return true;
        if (html.classList && html.classList.contains('dark')) return true;
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return true;
        const bg = getComputedStyle(container || document.body).backgroundColor || '';
        const m = bg.match(/rgba?\((\d+), ?(\d+), ?(\d+)/);
        if (m) {
          const r = Number(m[1]), g = Number(m[2]), b = Number(m[3]);
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          return lum < 128;
        }
      } catch (e) {}
      return false;
    }

    const dark = isDark();
    const iconColor = dark ? '#fff' : '#000';
    const bgColor = dark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.9)';

    const badge = document.createElement('div');
    badge.className = 'youtuned-vote-badge';
    badge.style.cssText = `position:absolute; top:6px; right:6px; z-index:9999; background:${bgColor}; color:${iconColor}; padding:4px 8px; border-radius:12px; font-size:11px; display:inline-flex; gap:8px; align-items:center; font-weight:600;`;

    const THUMBS_UP_SVG = `<svg viewBox="0 0 48 48" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M38,17H31l.4-3.3C32,8.8,31,4.9,27.8,4h-.3A2,2,0,0,0,26,5.2s-5.7,12-9,14.4V40h1.3a1.6,1.6,0,0,1,1.2.4c1.4,1,6.1,3.6,8.5,3.6h5c5.9,0,11-4,11.5-11.9h0l.5-8A6.7,6.7,0,0,0,38,17ZM3,22V38a2,2,0,0,0,2,2h8V20H5A2,2,0,0,0,3,22Z"/></svg>`;
    const THUMBS_DOWN_SVG = `<svg viewBox="0 0 48 48" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M45,24l-.5-8h0C44,8,38.9,4,33,4H28c-2.4,0-7.1,2.6-8.5,3.6a1.6,1.6,0,0,1-1.2.4H17V28.4c3.3,2.4,9,14.4,9,14.4A2,2,0,0,0,27.5,44h.3c3.2-.9,4.2-4.8,3.6-9.7L31,31h7A6.7,6.7,0,0,0,45,24ZM5,28h8V8H5a2,2,0,0,0-2,2V26A2,2,0,0,0,5,28Z"/></svg>`;

    function iconSVGFromString(svgString) {
      return `<span style="display:inline-flex; width:12px; height:12px;" aria-hidden="true">${svgString}</span>`;
    }

    if (likes != null) {
      const s = document.createElement('span');
      s.style.display = 'inline-flex';
      s.style.alignItems = 'center';
      s.style.gap = '6px';
      s.innerHTML = `${iconSVGFromString(THUMBS_UP_SVG)}<span>${Intl.NumberFormat('pt-BR').format(likes)}</span>`;
      badge.appendChild(s);
    }
    if (dislikes != null) {
      const s2 = document.createElement('span');
      s2.style.display = 'inline-flex';
      s2.style.alignItems = 'center';
      s2.style.gap = '6px';
      s2.innerHTML = `${iconSVGFromString(THUMBS_DOWN_SVG)}<span>${Intl.NumberFormat('pt-BR').format(dislikes)}</span>`;
      badge.appendChild(s2);
    }
    return badge;
  }

  async function processThumbnail(anchor) {
    if (!anchor || anchor.dataset.youtunedProcessed === 'true') return;
    const href = anchor.getAttribute('href') || '';
    const videoId = extrairVideoIdDeHref(href);
    if (!videoId) return;
    anchor.dataset.youtunedProcessed = 'true';
    const container = anchor.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytm-rich-item-renderer, ytm-grid-video-renderer') || anchor;
    if (!container) return;
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    const cache = loadVotesCache();
    const votes = cache[videoId] || await fetchVotes(videoId);
    if (!votes) return;
    const badge = criarBadgeDeThumbnail(votes.likes, votes.dislikes, container);
    const existente = container.querySelector('.youtuned-vote-badge');
    if (existente) existente.remove();
    container.appendChild(badge);
  }

  function processAllThumbnails() {
    const anchors = Array.from(document.querySelectorAll('a[href*="/watch?v="], a[href*="/shorts/"]'));
    anchors.forEach((a) => {
      if (a.dataset.youtunedProcessed !== 'true') {
        processThumbnail(a);
      }
    });
  }

  function scheduleThumbnailProcessing() {
    if (thumbnailProcessTimer) {
      return;
    }

    thumbnailProcessTimer = window.setTimeout(() => {
      thumbnailProcessTimer = null;
      processAllThumbnails();
    }, THUMBNAIL_PROCESS_DEBOUNCE_MS);
  }

  let thumbnailObserver = null;

  function iniciarProcessamentoDeThumbnails() {
    scheduleThumbnailProcessing();
    if (thumbnailObserver) return;
    thumbnailObserver = new MutationObserver(() => {
      scheduleThumbnailProcessing();
    });
    thumbnailObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  // Funções para mostrar contadores nos botões da página de vídeo (userscript)
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
    // Reaproveita um elemento de texto existente, se houver, para evitar duplicação.
    const existing = button.querySelector('#text, yt-formatted-string, .button-renderer-text, span[role="text"]');
    if (existing) return existing;
    const textSpan = document.createElement('span');
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

  window.iniciarProcessamentoDeThumbnails = iniciarProcessamentoDeThumbnails;
})();
