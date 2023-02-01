<template>
  <v-main class="fill-height" :class="{ 'cursor-none': !osd }">
    <div class="fullscreen-video-container fill-height" />
    <osd-player
      v-model="osd"
      :is-fullscreen="fullscreen.isFullscreen.value"
      @toggle-fullscreen="toggleFullscreen" />
  </v-main>
</template>

<route lang="yaml">
meta:
  layout: fullpage
  transition: slideUp
</route>

<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useFullscreen } from '@vueuse/core';
import { playbackManagerStore, videoPlayerStore } from '@/store';
import { mediaElementRef } from '@/store/videoPlayer';

const router = useRouter();
const playbackManager = playbackManagerStore();
const videoPlayer = videoPlayerStore();

const osd = ref(true);

let fullscreen = useFullscreen(document.body);

/**
 * Toggles the fullscreen view, based on browsers supporting it or not (basically iOS or the others)
 */
function toggleFullscreen(): void {
  if (fullscreen.isSupported.value) {
    fullscreen.toggle();
  } else if (
    !fullscreen.isSupported.value &&
    // @ts-expect-error - Property 'webkitEnterFullScreen' does not exist on type 'HTMLMediaElement'
    mediaElementRef.value?.webkitEnterFullScreen
  ) {
    // TODO - if entering FS this way, SSA subs won't display. So we should trigger a new encode
    // @ts-expect-error - Property 'webkitEnterFullScreen' does not exist on type 'HTMLMediaElement'
    mediaElementRef.value?.webkitEnterFullScreen();
  }
}

if (!playbackManager.currentItem) {
  router.replace('/');
}

onBeforeUnmount(() => {
  if (fullscreen.isFullscreen.value) {
    fullscreen.exit();
  }

  /**
   * Destroys SSO before unmouting ends cause if this page is going to be minimized, the canvas needs to be destroyed to be recreated in the mini player
   */
  videoPlayer.freeSsaTrack(true);

  if (!videoPlayer.isMinimized) {
    playbackManager.stop();
  }

  videoPlayer.isFullscreenMounted = false;
});

onMounted(() => {
  videoPlayer.isFullscreenMounted = true;
});
</script>

<style>
.fullscreen-video-container video {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  max-width: 100%;
  max-height: 100%;
}

.fullscreen-video-container video.stretched {
  width: 100%;
  height: 100%;
}
</style>

<style scoped>
.fullscreen-video-container {
  background: black;
}
</style>
