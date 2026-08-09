interface AppConfig {
  deepgramApiKey: string;
  openaiApiKey: string;
  docFolder: string;
  chatModel: string;
}

interface SettingsApi {
  getSettings: () => Promise<AppConfig>;
  saveSettings: (patch: Partial<AppConfig>) => Promise<AppConfig>;
  pickDocFolder: () => Promise<string | null>;
  reingestDocs: () => Promise<{ chunks: number }>;
}

interface Window {
  settingsApi: SettingsApi;
}

const deepgramInput = document.getElementById('deepgramApiKey') as HTMLInputElement;
const openaiInput = document.getElementById('openaiApiKey') as HTMLInputElement;
const chatModelSelect = document.getElementById('chatModel') as HTMLSelectElement;
const docFolderInput = document.getElementById('docFolder') as HTMLInputElement;
const browseBtn = document.getElementById('browseBtn') as HTMLButtonElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const reingestBtn = document.getElementById('reingestBtn') as HTMLButtonElement;
const statusMsg = document.getElementById('statusMsg') as HTMLDivElement;

async function load() {
  const config = await window.settingsApi.getSettings();
  deepgramInput.value = config.deepgramApiKey;
  openaiInput.value = config.openaiApiKey;
  chatModelSelect.value = config.chatModel;
  docFolderInput.value = config.docFolder;
}

browseBtn.addEventListener('click', async () => {
  statusMsg.textContent = 'Opening folder picker...';
  try {
    const folder = await window.settingsApi.pickDocFolder();
    if (folder) {
      docFolderInput.value = folder;
      statusMsg.textContent = '';
    } else {
      statusMsg.textContent = '';
    }
  } catch (err) {
    statusMsg.textContent = `Folder picker failed: ${(err as Error).message}`;
  }
});

saveBtn.addEventListener('click', async () => {
  statusMsg.textContent = 'Saving...';
  await window.settingsApi.saveSettings({
    deepgramApiKey: deepgramInput.value.trim(),
    openaiApiKey: openaiInput.value.trim(),
    chatModel: chatModelSelect.value,
    docFolder: docFolderInput.value.trim(),
  });
  statusMsg.textContent = 'Saved. Indexing documents...';
  try {
    const result = await window.settingsApi.reingestDocs();
    statusMsg.textContent = `Saved. Indexed ${result.chunks} chunk(s).`;
  } catch (err) {
    statusMsg.textContent = `Saved, but indexing failed: ${(err as Error).message}`;
  }
});

reingestBtn.addEventListener('click', async () => {
  statusMsg.textContent = 'Indexing documents...';
  try {
    const result = await window.settingsApi.reingestDocs();
    statusMsg.textContent = `Indexed ${result.chunks} chunk(s).`;
  } catch (err) {
    statusMsg.textContent = `Indexing failed: ${(err as Error).message}`;
  }
});

void load();
