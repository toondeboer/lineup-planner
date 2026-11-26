import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { useFonts } from 'expo-font';
import { fontFamily } from './tokens/primitives';

/**
 * Loads the three Inter weights the type scale uses. Imported per weight so the bundle holds three
 * font files, not all eighteen. Runtime loading (not the expo-font config plugin) keeps Expo Go and
 * the web build working.
 *
 * Returns `[loaded, error]`. When loading fails the app falls back to the system font.
 */
export function useAppFonts(): [boolean, Error | null] {
  return useFonts({
    [fontFamily.regular]: Inter_400Regular,
    [fontFamily.semibold]: Inter_600SemiBold,
    [fontFamily.bold]: Inter_700Bold,
  });
}
