// REQ-27 · `data/videos.ts` split by job; this barrel keeps every public name at `@/data/videos`.
export type { UploadFailure, VideoWithClipCount } from '@/lib/backend/core';
export { fileIdentity, isStaleCopy, markLocalCopy } from './localCopy';
export {
  useCreateVideo,
  useLinkLocalFile,
  useLinkVideoFile,
  useRestoreVideoFile,
  useUnlinkVideoFile,
  useUpdateVideo,
  useUploadToCloud,
  type CreateVideoInput,
  type CreateVideoResult,
  type LinkFileResult,
} from './mutations';
export { useDeleteVideo } from './deleteVideo';
export {
  forgetVideoUrl,
  posterOf,
  prefetchVideo,
  prefetchVideoUrl,
  signedVideoUrl,
  useJoinedPoster,
  useVideo,
  useVideoPosters,
  useVideos,
  videoKeys,
} from './queries';
export type { PosterMap } from './posters';
export { groupHasRoomForUpload, uploadFailureMessage, uploadGroupFile, type CloudFailure } from './upload';
