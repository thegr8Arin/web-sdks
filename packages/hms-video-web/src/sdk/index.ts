import HMSConfig from '../interfaces/config';
import InitialSettings from '../interfaces/settings';
import HMSInterface from '../interfaces/hms';
import HMSPeer from '../interfaces/hms-peer';
import HMSTransport from '../transport';
import ITransportObserver from '../transport/ITransportObserver';
import HMSUpdateListener, { HMSAudioListener, HMSPeerUpdate, HMSTrackUpdate } from '../interfaces/update-listener';
import HMSLogger, { HMSLogLevel } from '../utils/logger';
import decodeJWT from '../utils/jwt';
import { getNotificationMethod, HMSNotificationMethod } from './models/enums/HMSNotificationMethod';
import { getNotification, HMSNotifications, Peer as PeerNotification } from './models/HMSNotifications';
import NotificationManager from './NotificationManager';
import HMSTrack from '../media/tracks/HMSTrack';
import { HMSTrackType } from '../media/tracks';
import HMSException from '../error/HMSException';
import { HMSTrackSettingsBuilder } from '../media/settings/HMSTrackSettings';
import HMSRoom from './models/HMSRoom';
import { v4 as uuidv4 } from 'uuid';
import Peer from '../peer';
import Message from './models/HMSMessage';
import HMSVideoTrackSettings, { HMSVideoTrackSettingsBuilder } from '../media/settings/HMSVideoTrackSettings';
import HMSAudioTrackSettings, { HMSAudioTrackSettingsBuilder } from '../media/settings/HMSAudioTrackSettings';
import HMSAudioSinkManager from '../audio-sink-manager';
import DeviceManager from './models/DeviceManager';
import { HMSAnalyticsLevel } from '../analytics/AnalyticsEventLevel';
import analyticsEventsService from '../analytics/AnalyticsEventsService';

// @DISCUSS: Adding it here as a hotfix
const defaultSettings = {
  isAudioMuted: false,
  isVideoMuted: false,
  audioInputDeviceId: 'default',
  audioOutputDeviceId: 'default',
  videoDeviceId: 'default',
};

export class HMSSdk implements HMSInterface {
  transport!: HMSTransport | null;
  roomId!: string | null;
  localPeer!: HMSPeer | null;

  private TAG: string = '[HMSSdk]:';
  private notificationManager: NotificationManager = new NotificationManager();
  private listener!: HMSUpdateListener | null;
  private audioListener: HMSAudioListener | null = null;
  private audioSinkManager!: HMSAudioSinkManager;
  private hmsRoom?: HMSRoom | null;
  private published: boolean = false;
  private publishParams: any = null;
  private deviceManager: DeviceManager = new DeviceManager();

  private observer: ITransportObserver = {
    onNotification: (message: any) => {
      const method = getNotificationMethod(message.method);
      const notification = getNotification(method, message.params);
      // @TODO: Notification manager needs to be refactored. The current implementation is not manageable
      // this will pollute logs
      if (method !== HMSNotificationMethod.ACTIVE_SPEAKERS) {
        HMSLogger.d(this.TAG, `onNotification: message=${message}`);
      }
      this.notificationManager.handleNotification(method, notification, this.listener!, this.audioListener);
      this.onNotificationHandled(method, notification);
    },

    onTrackAdd: (track: HMSTrack) => {
      this.notificationManager.handleOnTrackAdd(track);
    },

    onTrackRemove: (track: HMSTrack) => {
      this.notificationManager.handleOnTrackRemove(track);
    },

    onFailure: (exception: HMSException) => {
      this.listener?.onError(exception);
    },
  };

  join(config: HMSConfig, listener: HMSUpdateListener) {
    this.notificationManager.addEventListener('role-change', (e: any) => {
      this.publishParams = e.detail.params.role.publishParams;
    });
    this.transport = new HMSTransport(this.observer);
    this.listener = listener;
    this.audioSinkManager = new HMSAudioSinkManager(this.notificationManager, config.audioSinkElementId);
    const { roomId, userId, role } = decodeJWT(config.authToken);

    const peerId = uuidv4();

    this.localPeer = new Peer({
      peerId,
      name: config.userName,
      isLocal: true,
      customerUserId: userId,
      role,
      customerDescription: config.metaData || '',
    });
    this.notificationManager.localPeer = this.localPeer;

    HMSLogger.d(this.TAG, `⏳ Joining room ${roomId}`);

    this.transport
      .join(
        config.authToken,
        this.localPeer.peerId,
        { name: config.userName, metaData: config.metaData || '' },
        config.initEndpoint,
        config.autoVideoSubscribe,
      )
      .then(() => {
        HMSLogger.d(this.TAG, `✅ Joined room ${roomId}`);
        this.roomId = roomId;
        if (!this.published) {
          this.publish(config.settings || defaultSettings);
        }
        this.listener?.onJoin(this.createRoom());
      });
  }

  private cleanUp() {
    this.audioSinkManager.cleanUp();
    this.notificationManager.cleanUp();

    this.published = false;
    this.localPeer = null;
    this.roomId = null;
    this.hmsRoom = null;
    this.transport = null;
    this.listener = null;
  }

  async leave() {
    if (this.roomId) {
      const roomId = this.roomId;
      HMSLogger.d(this.TAG, `⏳ Leaving room ${roomId}`);
      this.localPeer?.audioTrack?.nativeTrack.stop();
      this.localPeer?.videoTrack?.nativeTrack.stop();
      await this.transport?.leave();
      this.cleanUp();
      HMSLogger.d(this.TAG, `✅ Left room ${roomId}`);
    }
  }

  getLocalPeer(): HMSPeer {
    return this.localPeer!;
  }

  getPeers(): HMSPeer[] {
    const remotePeers = Array.from(this.notificationManager.hmsPeerList, (x) => x[1]);
    const peers = this.localPeer ? [...remotePeers, this.getLocalPeer()] : remotePeers;
    HMSLogger.d(this.TAG, `Got peers`, peers);
    return peers;
  }

  sendMessage(type: string, message: string, receiver?: string) {
    const hmsMessage = new Message({ sender: this.localPeer!.peerId, type, message, receiver });
    HMSLogger.d(this.TAG, 'Sending Message:: ', hmsMessage);
    this.transport!.sendMessage(hmsMessage);
    return hmsMessage;
  }

  async startScreenShare(onStop: () => void) {
    const { screen, allowed } = this.publishParams;
    const canPublishScreen = allowed && allowed.includes('screen');

    if (!canPublishScreen) {
      HMSLogger.e(this.TAG, `Role ${this.localPeer?.role} cannot share screen`);
      return;
    }

    if ((this.localPeer?.auxiliaryTracks?.length || 0) > 0) {
      throw Error('Cannot share multiple screens');
    }

    const track = await this.transport!.getLocalScreen(
      new HMSVideoTrackSettingsBuilder()
        // Don't cap maxBitrate for screenshare.
        // If publish params doesn't have bitRate value - don't set maxBitrate.
        .maxBitrate(screen.bitRate, false)
        .codec(screen.codec)
        .maxFramerate(screen.frameRate)
        .setWidth(screen.width)
        .setHeight(screen.height)
        .build(),
    );
    track.nativeTrack.onended = () => {
      this.stopEndedScreenshare(onStop);
    };
    await this.transport!.publish([track]);
    this.localPeer?.auxiliaryTracks.push(track);
  }

  private async stopEndedScreenshare(onStop: () => void) {
    HMSLogger.d(this.TAG, `✅ Screenshare ended natively`);
    await this.stopScreenShare();
    onStop();
  }

  async stopScreenShare() {
    HMSLogger.d(this.TAG, `✅ Screenshare ended from app`);
    const track = this.localPeer?.auxiliaryTracks.find((t) => t.type === HMSTrackType.VIDEO && t.source === 'screen');
    if (track) {
      await track.setEnabled(false);
      this.transport!.unpublish([track]);
      this.localPeer!.auxiliaryTracks.splice(this.localPeer!.auxiliaryTracks.indexOf(track), 1);
    }
  }

  setAnalyticsLevel(level: HMSAnalyticsLevel) {
    analyticsEventsService.level = level;
  }

  setLogLevel(level: HMSLogLevel) {
    HMSLogger.level = level;
  }

  addAudioListener(audioListener: HMSAudioListener) {
    this.audioListener = audioListener;
  }

  private onNotificationHandled(method: HMSNotificationMethod, notification: HMSNotifications) {
    // HMSLogger.d(this.TAG, 'onNotificationHandled', method);
    switch (method) {
      case HMSNotificationMethod.PEER_JOIN: {
        const peer = notification as PeerNotification;
        const hmsPeer = this.notificationManager.findPeerByPeerId(peer.peerId);
        hmsPeer
          ? this.listener!.onPeerUpdate(HMSPeerUpdate.PEER_JOINED, hmsPeer)
          : HMSLogger.e(this.TAG, `⚠️ peer not found in peer-list`, peer, this.notificationManager.hmsPeerList);
        break;
      }

      case HMSNotificationMethod.PEER_LEAVE: {
        const peer = notification as PeerNotification;
        const hmsPeer = new Peer({
          peerId: peer.peerId,
          name: peer.info.name,
          isLocal: false,
          customerUserId: peer.info.userId,
          customerDescription: peer.info.data,
          role: peer.role,
        }); //@TODO: There should be a cleaner way

        if (hmsPeer.audioTrack) {
          this.listener?.onTrackUpdate(HMSTrackUpdate.TRACK_REMOVED, hmsPeer.audioTrack, hmsPeer);
        }

        if (hmsPeer.videoTrack) {
          this.listener?.onTrackUpdate(HMSTrackUpdate.TRACK_REMOVED, hmsPeer.videoTrack, hmsPeer);
        }

        hmsPeer.auxiliaryTracks?.forEach((track) => {
          this.listener?.onTrackUpdate(HMSTrackUpdate.TRACK_REMOVED, track, hmsPeer);
        });

        this.listener?.onPeerUpdate(HMSPeerUpdate.PEER_LEFT, hmsPeer);
        break;
      }

      case HMSNotificationMethod.ROLE_CHANGE:
        break;

      case HMSNotificationMethod.ACTIVE_SPEAKERS:
        break;

      case HMSNotificationMethod.BROADCAST:
        const message = notification as Message;
        HMSLogger.d(this.TAG, `Received Message:: `, message);
        this.listener?.onMessageReceived(message);
        break;
    }
  }

  private publish(settings: InitialSettings) {
    const { isAudioMuted, isVideoMuted, audioInputDeviceId, videoDeviceId } = settings;
    const { audio, video, allowed } = this.publishParams;
    const canPublishAudio = allowed && allowed.includes('audio');
    const canPublishVideo = allowed && allowed.includes('video');
    HMSLogger.d(this.TAG, `Device IDs :  ${audioInputDeviceId} ,  ${videoDeviceId} `);
    const audioSettings: HMSAudioTrackSettings = new HMSAudioTrackSettingsBuilder()
      .codec(audio.codec)
      .maxBitrate(audio.bitRate)
      .deviceId(audioInputDeviceId)
      .build();
    const videoSettings: HMSVideoTrackSettings = new HMSVideoTrackSettingsBuilder()
      .codec(video.codec)
      .maxBitrate(video.bitRate)
      .maxFramerate(video.frameRate)
      .setWidth(video.width)
      .setHeight(video.height)
      .deviceId(videoDeviceId)
      .build();

    if (canPublishAudio || canPublishVideo) {
      this.transport
        ?.getLocalTracks(
          new HMSTrackSettingsBuilder()
            .video(canPublishVideo ? videoSettings : null)
            .audio(canPublishAudio ? audioSettings : null)
            .build(),
        )
        .then(async (hmsTracks) => {
          hmsTracks.forEach(async (hmsTrack) => {
            switch (hmsTrack.type) {
              case HMSTrackType.AUDIO:
                this.localPeer!.audioTrack = hmsTrack;
                break;

              case HMSTrackType.VIDEO:
                this.localPeer!.videoTrack = hmsTrack;
                break;
            }
            await this.transport!.publish([hmsTrack]);

            if (isAudioMuted && this.localPeer?.audioTrack) {
              await this.localPeer.audioTrack.setEnabled(false);
            }
            if (isVideoMuted && this.localPeer?.videoTrack) {
              await this.localPeer.videoTrack.setEnabled(false);
            }
            this.listener?.onTrackUpdate(HMSTrackUpdate.TRACK_ADDED, hmsTrack, this.localPeer!);
          });
          this.published = true;
          this.deviceManager.localPeer = this.localPeer;
        });
    }
  }

  createRoom() {
    const hmsPeerList = this.getPeers();
    this.hmsRoom = new HMSRoom(this.localPeer!.peerId, '', hmsPeerList);
    return this.hmsRoom;
  }
}
