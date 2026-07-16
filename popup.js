// Script do popup: gerencia as preferências do usuário e persiste em chrome.storage.local
// Comentários em português explicando cada passo.

// Obtém referências aos controles do popup
const toggleShorts = document.getElementById('toggleShorts');
const toggleDislikes = document.getElementById('toggleDislikes');

// Função que atualiza as caixas a partir do storage
function loadPopupSettings() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      // Lê as configurações salvas (padrões true)
      chrome.storage.local.get({ hideShorts: true, showDislikes: true }, (res) => {
        toggleShorts.checked = !!res.hideShorts;
        toggleDislikes.checked = !!res.showDislikes;
      });
      return;
    }
  } catch (e) {}
  // Fallback para ambientes sem chrome.storage (não usado normalmente)
  try {
    toggleShorts.checked = localStorage.getItem('youtuned_hideShorts') !== 'false';
    toggleDislikes.checked = localStorage.getItem('youtuned_showDislikes') !== 'false';
  } catch (e) {}
}

// Função que salva a configuração quando o usuário altera um toggle
function saveSetting(key, value) {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const obj = {};
      obj[key] = !!value;
      chrome.storage.local.set(obj);
      return;
    }
  } catch (e) {}
  try {
    localStorage.setItem(key === 'hideShorts' ? 'youtuned_hideShorts' : 'youtuned_showDislikes', value ? 'true' : 'false');
    // dispara evento storage para listeners locais
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

// Inicializa o popup carregando valores atuais
loadPopupSettings();
