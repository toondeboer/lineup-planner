import * as Clipboard from 'expo-clipboard';
import { Platform, Share } from 'react-native';
import type Svg from 'react-native-svg';

const FILE_NAME = 'lineup.png';
export const IMAGE_SIZE = { width: 800, height: 1040 };

/** Renders the mounted pitch to a PNG and returns it as base64. */
export function captureImage(svg: Svg): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Could not create the image')), 10000);
    (svg as unknown as { toDataURL: (cb: (b64: string) => void, o?: object) => void }).toDataURL((base64) => {
      clearTimeout(timer);
      resolve(base64);
    }, IMAGE_SIZE);
  });
}

function webFile(base64: string): File {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new File([bytes], FILE_NAME, { type: 'image/png' });
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Shares the lineup image. Returns what happened so the UI can tell the user:
 * "shared" (system share sheet), or "downloaded" (web without file sharing).
 */
export async function shareImage(base64: string, text?: string): Promise<'shared' | 'downloaded'> {
  if (Platform.OS === 'web') {
    const file = webFile(base64);
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    // Where the browser can share files (most phones), send the image and the text together.
    if (nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], text });
      return 'shared';
    }
    download(file);
    return 'downloaded';
  }
  const [{ File: NativeFile, Paths }, Sharing] = await Promise.all([import('expo-file-system'), import('expo-sharing')]);
  const file = new NativeFile(Paths.cache, FILE_NAME);
  file.write(base64, { encoding: 'base64' });
  await Sharing.shareAsync(file.uri, { mimeType: 'image/png', dialogTitle: 'Share lineup' });
  return 'shared';
}

export async function shareText(text: string): Promise<'shared' | 'copied'> {
  if (Platform.OS === 'web') {
    if (typeof navigator.share === 'function') {
      await navigator.share({ text });
      return 'shared';
    }
    await Clipboard.setStringAsync(text);
    return 'copied';
  }
  await Share.share({ message: text });
  return 'shared';
}

export async function copyText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}

/** WhatsApp link that opens a chat picker with the text filled in (works on web and phones). */
export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
