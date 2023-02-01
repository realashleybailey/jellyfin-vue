import { useMediaControls } from '@vueuse/core';
import { cloneDeep } from 'lodash-es';
import { reactive, ref, Ref } from 'vue';
// @ts-expect-error - No types on libass-wasm
import SubtitlesOctopus from '@jellyfin/libass-wasm';
import subtitlesOctopusWorkerUrl from '@jellyfin/libass-wasm/dist/js/subtitles-octopus-worker.js?url';
import { useRouter } from '@/composables';

let subtitlesOctopus: SubtitlesOctopus | undefined;

/**
 * == INTERFACES ==
 */
interface VideoPlayerState {
  isFullscreenMounted: boolean;
  isStretched: boolean;
}

/**
 * == STATE VARIABLES ==
 */
const defaultState: VideoPlayerState = {
  isFullscreenMounted: false,
  isStretched: true
};

const state = reactive<VideoPlayerState>(cloneDeep(defaultState));
export let mediaElementRef = ref<HTMLMediaElement>();
export let mediaControls = useMediaControls(mediaElementRef);

/**
 * Temporary function to set new media element ref until https://github.com/vuejs/core/pull/7593 is fixed
 */
export function setNewMediaElementRef(
  newMediaElementRef: Ref<HTMLMediaElement | undefined>
): void {
  // eslint-disable-next-line vue/no-ref-as-operand
  mediaElementRef = newMediaElementRef;
  mediaControls = useMediaControls(mediaElementRef);
}

/**
 * == CLASS CONSTRUCTOR ==
 */
class VideoPlayerStore {
  /**
   * == GETTERS ==
   */
  public get isFullscreenMounted(): boolean {
    return state.isFullscreenMounted;
  }

  public set isFullscreenMounted(newIsMounted: boolean) {
    state.isFullscreenMounted = newIsMounted;
  }

  public get isStretched(): boolean {
    return state.isStretched;
  }

  public set isStretched(newisStretched: boolean) {
    state.isStretched = newisStretched;
  }

  public get isMinimized(): boolean {
    return useRouter().currentRoute.value.fullPath !== '/playback/video';
  }

  /**
   * == ACTIONS ==
   */
  public toggleMinimize = (): void => {
    const router = useRouter();

    if (this.isMinimized) {
      router.push('/playback/video');
    } else {
      router.replace(
        typeof router.options.history.state.back === 'string'
          ? router.options.history.state.back
          : '/'
      );
    }
  };

  public setSsaTrack = (trackSrc: string, forceRecreate = false): void => {
    this.freeSsaTrack(forceRecreate);

    if (!subtitlesOctopus) {
      console.log('Enabling SSO');
      subtitlesOctopus = new SubtitlesOctopus({
        video: mediaElementRef.value,
        subUrl: trackSrc,
        workerUrl: subtitlesOctopusWorkerUrl,
        prescaleFactor: 0.8,
        renderAhead: 90
      });
    } else {
      console.log('Changing SSO track');
      subtitlesOctopus.setTrackByUrl(trackSrc);
    }
  };

  public freeSsaTrack = (destroy = false): void => {
    if (destroy && subtitlesOctopus) {
      console.log('Destroying SSO');
      subtitlesOctopus.dispose();
      subtitlesOctopus = undefined;
      console.log('Destroyed SSO');
    } else if (subtitlesOctopus) {
      subtitlesOctopus.freeTrack();
    }
  };
}

const videoPlayer = new VideoPlayerStore();

export default videoPlayer;
