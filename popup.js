// Script do popup: gerencia as preferências do usuário e persiste em chrome.storage.local
// Comentários em português explicando cada passo.

// Obtém referências aos controles do popup
const toggleShorts = document.getElementById('toggleShorts');
const toggleDislikes = document.getElementById('toggleDislikes');
const blockedWordsTextarea = document.getElementById('blockedWords');

// Função que atualiza as caixas a partir do storage
function loadPopupSettings() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      // Lê as configurações salvas (padrões true)
      chrome.storage.local.get({ hideShorts: true, showDislikes: true, blockedWords: '' }, (res) => {
        toggleShorts.checked = !!res.hideShorts;
        toggleDislikes.checked = !!res.showDislikes;
        blockedWordsTextarea.value = res.blockedWords || '';
      });
      return;
    }
  } catch (e) {}
  // Fallback para ambientes sem chrome.storage (não usado normalmente)
  try {
    toggleShorts.checked = localStorage.getItem('youtuned_hideShorts') !== 'false';
    toggleDislikes.checked = localStorage.getItem('youtuned_showDislikes') !== 'false';
    blockedWordsTextarea.value = localStorage.getItem('youtuned_blockedWords') || '';
  } catch (e) {}
}

// Função que salva a configuração quando o usuário altera um toggle ou texto
function saveSetting(key, value) {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const obj = {};
      obj[key] = value;
      chrome.storage.local.set(obj);
      return;
    }
  } catch (e) {}
  try {
    if (key === 'hideShorts') {
      localStorage.setItem('youtuned_hideShorts', value ? 'true' : 'false');
    } else if (key === 'showDislikes') {
      localStorage.setItem('youtuned_showDislikes', value ? 'true' : 'false');
    } else if (key === 'blockedWords') {
      localStorage.setItem('youtuned_blockedWords', value);
    }
    window.dispatchEvent(new Event('storage'));
  } catch (e) {}
}

// Configura listeners para salvar alterações feitas pelo usuário
toggleShorts.addEventListener('change', () => {
  saveSetting('hideShorts', toggleShorts.checked);
});

toggleDislikes.addEventListener('change', () => {
  saveSetting('showDislikes', toggleDislikes.checked);
});

blockedWordsTextarea.addEventListener('input', () => {
  saveSetting('blockedWords', blockedWordsTextarea.value);
});

// Inicializa o popup carregando valores atuais
loadPopupSettings();
