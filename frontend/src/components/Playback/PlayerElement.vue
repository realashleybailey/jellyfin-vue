<template>
  <template v-if="playbackManager.currentlyPlayingMediaElement">
    <Teleport :to="teleportTarget">
      <component
        :is="playbackManager.currentlyPlayingMediaElement"
        v-show="videoPlayer.isFullscreenMounted || videoPlayer.isMinimized"
        ref="mediaElementRef"
        :poster="posterUrl"
        autoplay
        crossorigin="anonymous"
        playsinline
        :loop="playbackManager.isRepeatingOnce"
        :class="{ stretched: videoPlayer.isStretched }">
        <track
          v-for="sub in playbackManager.currentItemVttParsedSubtitleTracks"
          :key="`${playbackManager.currentSourceUrl}-${sub.srcIndex}`"
          kind="subtitles"
          :label="sub.label"
          :srclang="sub.srcLang"
          :src="sub.src" />
      </component>
    </Teleport>
  </template>
</template>

<script setup lang="ts">
import { computed, watch, ref, nextTick } from 'vue';
import { isNil } from 'lodash-es';
import { useI18n } from 'vue-i18n';
import Hls from 'hls.js';
import { pausableWatch } from '@vueuse/core';
import { playbackManagerStore, videoPlayerStore } from '@/store';
import { getImageInfo } from '@/utils/images';
import { useSnackbar } from '@/composables';
import { setNewMediaElementRef } from '@/store/videoPlayer';

/**
 * Temporary calls to set new media element ref until https://github.com/vuejs/core/pull/7593 is fixed
 */
const mediaElementRef = ref<HTMLMediaElement>();

setNewMediaElementRef(mediaElementRef);

const playbackManager = playbackManagerStore();
const videoPlayer = videoPlayerStore();
const { t } = useI18n();

let hls: Hls | undefined;

/**
 * If the player is a video element and we're in the PiP player or fullscreen video playback, we need to ensure the DOM elements are mounted before the teleport target is ready
 */
const teleportTarget = computed<
  'body' | '.fullscreen-video-container' | '.minimized-video-container'
>(() => {
  if (playbackManager.currentlyPlayingMediaElement === 'audio') {
    return 'body';
  } else if (
    playbackManager.currentlyPlayingMediaElement === 'video' &&
    !videoPlayer.isMinimized &&
    videoPlayer.isFullscreenMounted
  ) {
    return '.fullscreen-video-container';
  } else if (playbackManager.currentlyPlayingMediaElement === 'video') {
    /**
     * Defaults video to the PiP container to render it
     */
    return '.minimized-video-container';
  } else {
    return 'body';
  }
});

const posterUrl = computed<string>(() =>
  !isNil(playbackManager.currentItem) &&
  playbackManager.currentlyPlayingMediaElement === 'video'
    ? getImageInfo(playbackManager.currentItem, {
        preferBackdrop: true
      }).url || ''
    : ''
);

/**
 * Applies the current subtitle from the playbackManager store
 *
 * It first disables all the VTT subtitles
 * If external and VTT, it shows the correct one
 * If external and SSA, it loads it in SO
 * If embedded, it triggers a new transcode
 *
 * Optionnally force destroy SSO, useful when needing its canvas to move when switching from FS context to minimized
 */
async function applyCurrentSubtitle(recreateSso = false): Promise<void> {
  await nextTick();

  if (mediaElementRef.value) {
    /**
     * Disabling VTT and SSA subs at first
     */
    for (let i = 0; i < mediaElementRef.value.textTracks.length; ++i) {
      if (mediaElementRef.value.textTracks[i].mode !== 'disabled') {
        console.log('Disabling vtt ' + i);
        mediaElementRef.value.textTracks[i].mode = 'disabled';
      }
    }

    videoPlayer.freeSsaTrack(recreateSso);

    /**
     * Finding (if it exists) the VTT or SSA track associated to the newly picked subtitle
     */
    const vttIdx = playbackManager.currentItemVttParsedSubtitleTracks.findIndex(
      (sub) => sub.srcIndex === playbackManager.currentSubtitleStreamIndex
    );

    const ass = playbackManager.currentItemAssParsedSubtitleTracks.find(
      (sub) => sub.srcIndex === playbackManager.currentSubtitleStreamIndex
    );

    if (vttIdx !== -1 && mediaElementRef.value.textTracks[vttIdx]) {
      /**
       * If VTT found, applying it
       */
      console.log('Enabling VTT ' + vttIdx);
      mediaElementRef.value.textTracks[vttIdx].mode = 'showing';
    } else if (ass !== undefined && ass.src) {
      /**
       * If SSA, using Subtitle Opctopus
       */
      videoPlayer.setSsaTrack(ass.src);
    }
  }
}

const applySubtitlesWatcher = pausableWatch(
  () => [
    videoPlayer.isFullscreenMounted,
    playbackManager.currentSubtitleStreamIndex
  ],
  () => applyCurrentSubtitle()
);

watch(
  () => playbackManager.currentSourceUrl,
  async () => {
    if (playbackManager.currentSourceUrl) {
      /**
       * Wait for nextTick to have the DOM updated accordingly
       */
      await nextTick();

      try {
        if (!mediaElementRef.value) {
          throw new Error('No media element found');
        }

        if (
          (playbackManager.currentMediaSource?.SupportsDirectPlay &&
            playbackManager.currentlyPlayingMediaType === 'Audio') ||
          (mediaElementRef.value.canPlayType('application/vnd.apple.mpegurl') &&
            playbackManager.currentlyPlayingMediaType === 'Video')
        ) {
          /**
           * For the video case, Safari iOS doesn't support hls.js but supports native HLS
           */
          console.log('Direct HTML play');
          mediaElementRef.value.src = playbackManager.currentSourceUrl;
          mediaElementRef.value.currentTime = playbackManager.currentTime;
        } else if (
          Hls.isSupported() &&
          playbackManager.currentlyPlayingMediaType === 'Video'
        ) {
          console.log('HLS play');

          if (!hls) {
            hls = new Hls({ startPosition: playbackManager.currentTime });
            hls.attachMedia(mediaElementRef.value);
          } else {
            hls.config.startPosition = playbackManager.currentTime;
          }

          hls.on(Hls.Events.ERROR, (event, data) => {
            console.error(event);
            console.error(data);
          });

          hls.loadSource(playbackManager.currentSourceUrl);
        } else {
          throw new Error('No playable case');
        }
      } catch {
        useSnackbar(t('errors.cantPlayItem'), 'error');
        playbackManager.stop();
      }
    } else {
      applySubtitlesWatcher.pause();

      if (hls) {
        console.log('Destroying HLS');
        hls.destroy();
        hls = undefined;
      }

      videoPlayer.freeSsaTrack(true);
    }
  }
);
</script>
