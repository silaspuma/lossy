export type Song = {
  id: string;
  title: string;
  artist: string;
  album: string;
  audioUrl: string;
  artworkUrl?: string | null;
  audioKey?: string;
  artworkKey?: string;
};
