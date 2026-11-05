// REQ-27 · `data/videos.ts` split by job; this barrel keeps every public name at `@/data/videos`.
export type { VideoWithClipCount } from '@/lib/backend/core';
export { fileIdentity, isStaleCopy, markLocalCopy } from './localCopy';
export {
  useCreateVideo,
  useLinkLocalFile,
  useLinkVideoFile,
  useRestoreVideoFile,
  useUnlinkVideoFile,
  useUpdateVideo,
  useUploadToCloud,
} from './mutations';
export { useDeleteVideo } from './deleteVideo';
export {
  forgetVideoUrl,
  prefetchVideo,
  prefetchVideoUrl,
  signedVideoUrl,
  useJoinedPoster,
  useVideo,
  useVideos,
  videoKeys,
} from './queries';
export { uploadFailureMessage, uploadGroupFile } from './upload';
