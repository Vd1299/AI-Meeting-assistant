import Store from 'electron-store';

export interface AppConfig {
  deepgramApiKey: string;
  openaiApiKey: string;
  docFolder: string;
  chatModel: string;
}

const defaults: AppConfig = {
  deepgramApiKey: '',
  openaiApiKey: '',
  docFolder: '',
  chatModel: 'gpt-4o-mini',
};

export const store = new Store<AppConfig>({ defaults });

export function getConfig(): AppConfig {
  return {
    deepgramApiKey: store.get('deepgramApiKey'),
    openaiApiKey: store.get('openaiApiKey'),
    docFolder: store.get('docFolder'),
    chatModel: store.get('chatModel'),
  };
}

export function saveConfig(patch: Partial<AppConfig>): AppConfig {
  for (const [key, value] of Object.entries(patch)) {
    store.set(key as keyof AppConfig, value as string);
  }
  return getConfig();
}
