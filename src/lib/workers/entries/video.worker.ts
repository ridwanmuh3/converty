import { convertVideoToMp3 } from '#lib/pipelines/video-to-audio';
import { serve } from '../serve';

serve({
	'mp4-to-mp3': convertVideoToMp3,
	'video-to-mp3': convertVideoToMp3
});
