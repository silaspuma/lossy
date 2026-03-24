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

export type AlbumSearchResult = {
  id: string;
  title: string;
  artist: string;
  year?: string;
  coverUrl?: string | null;
};

export type AlbumRequest = {
  id: string;
  albumId: string;
  title: string;
  artist: string;
  year?: string;
  status: "pending" | "completed";
  createdAt: string;
  completedAt?: string;
};
