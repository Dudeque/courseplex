import { get, set, del } from 'idb-keyval';

export const ROOT_HANDLE_KEY = 'courseplex_root_dir_handle';
export const ROOT_HANDLE_NAME_KEY = 'courseplex_root_dir_name';

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function pickAndSaveRootDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!isFileSystemAccessSupported()) {
    throw new Error('File System Access API is not supported in this browser. Please use Chrome, Edge, or Brave.');
  }

  const handle = await (window as unknown as { showDirectoryPicker: (opts: { mode: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({
    mode: 'readwrite',
  });

  await set(ROOT_HANDLE_KEY, handle);
  await set(ROOT_HANDLE_NAME_KEY, handle.name);
  return handle;
}

export async function getSavedRootDirectory(): Promise<{
  handle: FileSystemDirectoryHandle | null;
  name: string | null;
  permissionState: PermissionState | 'missing';
}> {
  if (typeof window === 'undefined') {
    return { handle: null, name: null, permissionState: 'missing' };
  }

  try {
    const handle = await get<FileSystemDirectoryHandle>(ROOT_HANDLE_KEY);
    const savedName = await get<string>(ROOT_HANDLE_NAME_KEY);
    if (!handle) return { handle: null, name: null, permissionState: 'missing' };

    const queryPerm = (handle as unknown as { queryPermission: (opts: { mode: string }) => Promise<PermissionState> });
    if (typeof queryPerm?.queryPermission === 'function') {
      const perm = await queryPerm.queryPermission({ mode: 'readwrite' });
      return { handle, name: savedName || handle.name, permissionState: perm };
    }
    return { handle, name: savedName || handle.name, permissionState: 'granted' };
  } catch (err) {
    console.warn('Could not retrieve stored directory handle:', err);
    return { handle: null, name: null, permissionState: 'missing' };
  }
}

export async function requestRootPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const reqPerm = (handle as unknown as { requestPermission: (opts: { mode: string }) => Promise<PermissionState> });
    if (typeof reqPerm?.requestPermission === 'function') {
      const perm = await reqPerm.requestPermission({ mode: 'readwrite' });
      return perm === 'granted';
    }
    return true;
  } catch (err) {
    console.error('Permission request failed:', err);
    return false;
  }
}

export async function clearSavedRootDirectory(): Promise<void> {
  await del(ROOT_HANDLE_KEY);
  await del(ROOT_HANDLE_NAME_KEY);
}
