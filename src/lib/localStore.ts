const FILE_MAP_KEY = 'autoprint.local-file-map';

type LocalFileRecord = { jobId: string; path: string; updatedAt: string };

export function getLocalFilePath(jobId: string) {
  try {
    const records = JSON.parse(localStorage.getItem(FILE_MAP_KEY) || '{}') as Record<string, LocalFileRecord>;
    return records[jobId]?.path || '';
  } catch { return ''; }
}

export function setLocalFilePath(jobId: string, path: string) {
  try {
    const records = JSON.parse(localStorage.getItem(FILE_MAP_KEY) || '{}') as Record<string, LocalFileRecord>;
    records[jobId] = { jobId, path, updatedAt: new Date().toISOString() };
    localStorage.setItem(FILE_MAP_KEY, JSON.stringify(records));
  } catch { /* native desktop mapping will replace this browser fallback */ }
}
