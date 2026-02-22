export class VideoService {
  private videoUrls = [
    "https://v.pstatp.com/video/tos/cn/v0201/01010101010101010101010101010101/01010101010101010101010101010101.mp4", // This is just a placeholder pattern, let's use real ones
  ];

  // Using reliable Pexels-hosted videos (direct links)
  private realVideos = [
    "https://player.vimeo.com/external/370331493.sd.mp4?s=33d548605da61cf2a0515450a0146f6c32b7ad9e&profile_id=139&oauth2_token_id=57447761",
    "https://player.vimeo.com/external/370331493.sd.mp4?s=33d548605da61cf2a0515450a0146f6c32b7ad9e&profile_id=139&oauth2_token_id=57447761",
    "https://player.vimeo.com/external/434045526.sd.mp4?s=c27db0607693d93253deabc12730b4ff3e65d076&profile_id=139&oauth2_token_id=57447761",
    "https://player.vimeo.com/external/481139424.sd.mp4?s=5ef44dca7656025e03393b3f94e245631f7a82ef&profile_id=139&oauth2_token_id=57447761",
    "https://player.vimeo.com/external/370331493.sd.mp4?s=33d548605da61cf2a0515450a0146f6c32b7ad9e&profile_id=139&oauth2_token_id=57447761"
  ];

  async getLevelVideo(level: number): Promise<string> {
    return this.realVideos[(level - 1) % this.realVideos.length];
  }
}

export const videoService = new VideoService();
