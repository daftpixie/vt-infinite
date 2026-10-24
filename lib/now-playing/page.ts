import { nowPlayingEnabled } from "./config";
import { readNowPlaying, type NowPlayingResult } from "./service";

/** For a page: the current projection when the feature is on, otherwise undefined and nothing is read. */
export async function landingNowPlaying(): Promise<NowPlayingResult | undefined> {
  return nowPlayingEnabled() ? readNowPlaying() : undefined;
}
