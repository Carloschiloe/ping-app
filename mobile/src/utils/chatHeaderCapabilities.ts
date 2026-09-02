export function getChatHeaderCapabilities(isSelf: boolean) {
    return {
        voiceCall: !isSelf,
        videoCall: !isSelf,
        participantActions: !isSelf,
    };
}
