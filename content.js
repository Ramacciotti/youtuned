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

  // Configurações da extensão (lidas de chrome.storage.local quando disponível).
  let youtunedSettings = {
    hideShorts: true,
    showDislikes: true,
  };

  // Lê as configurações salvas — usa chrome.storage quando disponível, caso contrário localStorage.
  function readSettings() {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get({ hideShorts: true, showDislikes: true }, (res) => {
            youtunedSettings.hideShorts = !!res.hideShorts;
            youtunedSettings.showDislikes = !!res.showDislikes;
            resolve(youtunedSettings);
          });
          return;
        }
      } catch (e) {}
      // Fallback para localStorage (userscript / ambientes sem chrome.storage)
      try {
        const hs = localStorage.getItem('youtuned_hideShorts');
        const sd = localStorage.getItem('youtuned_showDislikes');
        youtunedSettings.hideShorts = hs !== 'false';
        youtunedSettings.showDislikes = sd !== 'false';
      } catch (e) {}
      resolve(youtunedSettings);
    });
  }

  // Aplica as configurações em tempo de execução: habilita/desabilita recursos.
  function enableShorts() {
    esconderShortsPorCSS();
    esconderShortsNoDOM();
    limparItensVazios();
    iniciarObservador();
  }

  function disableShorts() {
    // Remove a folha de estilo injetada
    const estilo = document.getElementById('youtube-shorts-remover-style');
    if (estilo && estilo.parentNode) estilo.parentNode.removeChild(estilo);
    // Reexibe elementos que marcamos como ocultos manualmente
    document.querySelectorAll('[data-shorts-hidden="true"]').forEach((el) => {
      el.style.removeProperty('display');
      el.removeAttribute('aria-hidden');
      delete el.dataset.shortsHidden;
    });
    // Para o observador se estiver ativo
    if (window.__youtubeShortsObserver) {
      try { window.__youtubeShortsObserver.disconnect(); } catch {};
      delete window.__youtubeShortsObserver;
    }
  }

  function enableDislikes() {
    restaurarDislikes();
    iniciarProcessamentoDeThumbnails();
  }

  function disableDislikes() {
    // Remove badge(s) das thumbnails
    document.querySelectorAll('.youtuned-vote-badge').forEach((b) => b.remove());
    // Remove badge único de vídeo
    const badge = document.getElementById(idDoBadgeDeDislikes);
    if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
  }

  // Observa mudanças nas configurações (chrome.storage quando disponível, senão storage event local)
  function listenSettingsChanges() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area !== 'local') return;
          if (changes.hideShorts) {
            youtunedSettings.hideShorts = !!changes.hideShorts.newValue;
            if (youtunedSettings.hideShorts) enableShorts(); else disableShorts();
          }
          if (changes.showDislikes) {
            youtunedSettings.showDislikes = !!changes.showDislikes.newValue;
            if (youtunedSettings.showDislikes) enableDislikes(); else disableDislikes();
          }
        });
        return;
      }
    } catch (e) {}
    // Fallback para localStorage events (não funciona entre extensão e página, mas serve em alguns casos)
    window.addEventListener('storage', (ev) => {
      if (ev.key === 'youtuned_hideShorts') {
        youtunedSettings.hideShorts = ev.newValue !== 'false';
        if (youtunedSettings.hideShorts) enableShorts(); else disableShorts();
      }
      if (ev.key === 'youtuned_showDislikes') {
        youtunedSettings.showDislikes = ev.newValue !== 'false';
        if (youtunedSettings.showDislikes) enableDislikes(); else disableDislikes();
      }
    });
  }

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
    // Aplica recursos conforme as configurações lidas.
    if (youtunedSettings.hideShorts) {
      enableShorts();
    }
    if (youtunedSettings.showDislikes) {
      enableDislikes();
    }
  }

  // Garante que a extensão rode quando a navegação do YouTube terminar de carregar a página.
  document.addEventListener('yt-navigate-finish', iniciarExtensao, { once: false });
  window.addEventListener('load', iniciarExtensao, { once: true });
  // Lê configurações antes de iniciar e escuta mudanças.
  readSettings().then(() => {
    listenSettingsChanges();
    iniciarExtensao();
  });
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

  // Determina se o tema do YouTube / container aparenta ser escuro.
  function isDarkThemeForContainer(container) {
    try {
      const html = document.documentElement;
      if (html.hasAttribute('dark')) return true;
      if (html.classList && html.classList.contains('dark')) return true;
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return true;
      // Fallback: calcula luminância do background do container
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

  // Cria um badge pequeno e legível para a thumbnail com likes/dislikes.
  // Usa SVGs com `currentColor` para permitir colorir os ícones conforme o tema.
  function criarBadgeDeThumbnail(likes, dislikes, container) {
    const dark = isDarkThemeForContainer(container);
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

    const badge = criarBadgeDeThumbnail(votes.likes, votes.dislikes, container);
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
