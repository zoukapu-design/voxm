
// ---- VOXM native audio helper (appended to AppDelegate.swift by ci/prepare-ios.sh) ----
// - keeps the converted voice on the loudspeaker (not the quiet earpiece) when no earphones are connected
// - tells the web app whether earphones are connected, so it can turn echo cancellation off for them
//   (on the speaker the phone's echo canceller slowly turns your own voice down while you listen to it)
@objc(VoxAudioPlugin)
public class VoxAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VoxAudioPlugin"
    public let jsName = "VoxAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "prepare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "route", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(routeChanged(_:)),
                                               name: AVAudioSession.routeChangeNotification, object: nil)
    }

    static func headphones() -> Bool {
        let wired: [AVAudioSession.Port] = [.headphones, .bluetoothA2DP, .bluetoothHFP, .bluetoothLE, .usbAudio, .airPlay, .carAudio, .lineOut]
        return AVAudioSession.sharedInstance().currentRoute.outputs.contains { wired.contains($0.portType) }
    }

    static func keepOnSpeaker() {
        let s = AVAudioSession.sharedInstance()
        if s.currentRoute.outputs.contains(where: { $0.portType == .builtInReceiver }) {
            try? s.overrideOutputAudioPort(.speaker)
        }
    }

    @objc func prepare(_ call: CAPPluginCall) {
        let s = AVAudioSession.sharedInstance()
        try? s.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothA2DP])
        try? s.setPreferredIOBufferDuration(0.005)
        try? s.setActive(true)
        VoxAudioPlugin.keepOnSpeaker()
        call.resolve(["headphones": VoxAudioPlugin.headphones()])
    }

    @objc func route(_ call: CAPPluginCall) {
        VoxAudioPlugin.keepOnSpeaker()
        let outs = AVAudioSession.sharedInstance().currentRoute.outputs.map { $0.portType.rawValue }
        call.resolve(["headphones": VoxAudioPlugin.headphones(), "outputs": outs])
    }

    @objc func routeChanged(_ n: Notification) {
        DispatchQueue.main.async {
            if !VoxAudioPlugin.headphones() { VoxAudioPlugin.keepOnSpeaker() }
            self.notifyListeners("route", data: ["headphones": VoxAudioPlugin.headphones()])
        }
    }
}

class VoxBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(VoxAudioPlugin())
    }
}
