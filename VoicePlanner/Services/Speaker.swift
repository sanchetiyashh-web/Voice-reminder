import AVFoundation

/// Optional spoken read-back of confirmations (on-device text-to-speech).
@MainActor
final class Speaker {
    private let synth = AVSpeechSynthesizer()

    func say(_ text: String, localeId: String) {
        let u = AVSpeechUtterance(string: text)
        u.voice = AVSpeechSynthesisVoice(language: localeId) ?? AVSpeechSynthesisVoice(language: "en-IN")
        u.rate = AVSpeechUtteranceDefaultSpeechRate
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        synth.stopSpeaking(at: .immediate)
        synth.speak(u)
    }
}
