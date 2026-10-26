import { TrackItem } from '../types';

const AUDIO_EXTS = [
  '.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.alac',
  '.aiff', '.aif', '.wma', '.dsf', '.dff', '.opus', '.m4b',
];

export const isAudioFile = (file: File): boolean => {
  if (file.type && file.type.startsWith('audio/')) return true;
  const name = file.name.toLowerCase();
  return AUDIO_EXTS.some((ext) => name.endsWith(ext));
};

export interface LocalNode {
  name: string;
  dirs: Map<string, LocalNode>;
  files: File[];
}

/** Build a folder tree from a directory-picker FileList (webkitRelativePath). */
export function buildFolderTree(files: File[]): LocalNode {
  const root: LocalNode = { name: 'ROOT', dirs: new Map(), files: [] };
  for (const f of files) {
    if (!isAudioFile(f)) continue;
    const rel = f.webkitRelativePath || f.name;
    const parts = rel.split('/');
    let node = root;
    // Segment 0 = the picked folder itself; nest from segment 1 onward
    for (let i = 1; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (!node.dirs.has(seg)) node.dirs.set(seg, { name: seg, dirs: new Map(), files: [] });
      node = node.dirs.get(seg)!;
    }
    node.files.push(f);
  }
  return root;
}

export interface TrackFileSet {
  tracks: TrackItem[];
  /** Files aligned 1:1 with tracks (for async artwork extraction) */
  files: File[];
}

/** Deterministic TrackItem build (same rules as the original local import). */
export function filesToTrackItems(files: File[]): TrackFileSet {
  const sorted = [...files].sort((a, b) => {
    const pa = a.webkitRelativePath || a.name;
    const pb = b.webkitRelativePath || b.name;
    return pa.localeCompare(pb, undefined, { numeric: true, sensitivity: 'base' });
  });
  const stamp = Date.now();
  const tracks = sorted.map((file, idx) => {
    let albumName = 'Local Import';
    let artistName = 'Local Audio';
    if (file.webkitRelativePath) {
      const parts = file.webkitRelativePath.split('/');
      if (parts.length >= 3) {
        artistName = parts[parts.length - 3];
        albumName = parts[parts.length - 2];
      } else if (parts.length === 2) {
        albumName = parts[0];
      }
    }
    const title = file.name.replace(/\.[^/.]+$/, '');
    return {
      id: `local-${stamp}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
      title,
      artist: artistName,
      album: albumName,
      url: URL.createObjectURL(file),
      isLocal: true,
    } as TrackItem;
  });
  return { tracks, files: sorted };
}
