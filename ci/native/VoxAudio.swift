
// ---- VOXM native audio helper (appended to AppDelegate.swift by ci/prepare-ios.sh) ----
// - keeps the converted voice on the loudspeaker (not the quiet earpiece) when no earphones are connected
// - tells the web app whether earphones are connected, so it can turn echo cancellation off for them
//   (on the speaker the phone's echo canceller slowly turns your own voice down while you listen to it)
@objc(VoxAudioPlugin)
public class VoxAudioPlugin: CAPPlugin, CAPBridgedPlugin, RPPreviewViewControllerDelegate, PHPickerViewControllerDelegate {
    public let identifier = "VoxAudioPlugin"
    public let jsName = "VoxAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "prepare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "route", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "diag", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recStart", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recStop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickVideo", returnType: CAPPluginReturnPromise)
    ]
    var pickCall: CAPPluginCall?

    // ---- small native log, pulled by the web app's debug log (diag) ----
    static var logs: [(Int, String)] = []
    static var seq = 0
    static let t0 = Date()
    static func nlog(_ msg: String) {
        let line = String(format: "%8.2f ", Date().timeIntervalSince(VoxAudioPlugin.t0)) + msg
        DispatchQueue.main.async {
            VoxAudioPlugin.seq += 1
            VoxAudioPlugin.logs.append((VoxAudioPlugin.seq, line))
            if VoxAudioPlugin.logs.count > 500 { VoxAudioPlugin.logs.removeFirst(VoxAudioPlugin.logs.count - 500) }
        }
    }
    static func routeDesc() -> String {
        let r = AVAudioSession.sharedInstance().currentRoute
        let o = r.outputs.map { "\($0.portType.rawValue)" }.joined(separator: ",")
        let i = r.inputs.map { "\($0.portType.rawValue)" }.joined(separator: ",")
        return "out=[\(o)] in=[\(i)]"
    }
    static func sessionDesc() -> String {
        let s = AVAudioSession.sharedInstance()
        return "cat=\(s.category.rawValue) mode=\(s.mode.rawValue) opts=\(s.categoryOptions.rawValue) sr=\(s.sampleRate) io=\(String(format: "%.4f", s.ioBufferDuration)) \(routeDesc())"
    }

    override public func load() {
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(routeChanged(_:)), name: AVAudioSession.routeChangeNotification, object: nil)
        nc.addObserver(self, selector: #selector(interrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
        nc.addObserver(self, selector: #selector(servicesReset(_:)), name: AVAudioSession.mediaServicesWereResetNotification, object: nil)
        VoxAudioPlugin.nlog("plugin loaded " + VoxAudioPlugin.sessionDesc())
    }

    static func headphones() -> Bool {
        let wired: [AVAudioSession.Port] = [.headphones, .bluetoothA2DP, .bluetoothHFP, .bluetoothLE, .usbAudio, .airPlay, .carAudio, .lineOut]
        return AVAudioSession.sharedInstance().currentRoute.outputs.contains { wired.contains($0.portType) }
    }

    static func keepOnSpeaker() {
        let s = AVAudioSession.sharedInstance()
        if s.currentRoute.outputs.contains(where: { $0.portType == .builtInReceiver }) {
            do { try s.overrideOutputAudioPort(.speaker); nlog("override → speaker") }
            catch { nlog("override speaker failed: \(error.localizedDescription)") }
        }
    }

    @objc func prepare(_ call: CAPPluginCall) {
        if call.getBool("skip") ?? false {
            VoxAudioPlugin.nlog("prepare (skip) " + VoxAudioPlugin.sessionDesc())
            call.resolve(["headphones": VoxAudioPlugin.headphones()])
            return
        }
        let s = AVAudioSession.sharedInstance()
        do { try s.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothA2DP]) }
        catch { VoxAudioPlugin.nlog("setCategory failed: \(error.localizedDescription)") }
        do { try s.setPreferredIOBufferDuration(0.005) } catch { VoxAudioPlugin.nlog("setIOBuffer failed: \(error.localizedDescription)") }
        do { try s.setActive(true) } catch { VoxAudioPlugin.nlog("setActive failed: \(error.localizedDescription)") }
        VoxAudioPlugin.keepOnSpeaker()
        VoxAudioPlugin.nlog("prepare " + VoxAudioPlugin.sessionDesc())
        call.resolve(["headphones": VoxAudioPlugin.headphones()])
    }

    @objc func route(_ call: CAPPluginCall) {
        VoxAudioPlugin.keepOnSpeaker()
        let outs = AVAudioSession.sharedInstance().currentRoute.outputs.map { $0.portType.rawValue }
        call.resolve(["headphones": VoxAudioPlugin.headphones(), "outputs": outs])
    }

    @objc func diag(_ call: CAPPluginCall) {
        let after = call.getInt("after") ?? 0
        let s = AVAudioSession.sharedInstance()
        let r = s.currentRoute
        let lines = VoxAudioPlugin.logs.filter { $0.0 > after }.map { $0.1 }
        call.resolve([
            "category": s.category.rawValue, "mode": s.mode.rawValue, "options": Int(s.categoryOptions.rawValue),
            "sampleRate": s.sampleRate, "ioBuffer": s.ioBufferDuration,
            "outputLatency": s.outputLatency, "inputLatency": s.inputLatency,
            "outputVolume": Double(s.outputVolume), "otherAudio": s.isOtherAudioPlaying, "inputAvailable": s.isInputAvailable,
            "outputs": r.outputs.map { "\($0.portType.rawValue):\($0.portName)" },
            "inputs": r.inputs.map { "\($0.portType.rawValue):\($0.portName)" },
            "headphones": VoxAudioPlugin.headphones(),
            "recording": RPScreenRecorder.shared().isRecording,
            "seq": VoxAudioPlugin.seq, "logs": lines
        ])
    }

    // ---- screen recording (ReplayKit). The preview lets the user save the video to Photos or share it. ----
    @objc func recStart(_ call: CAPPluginCall) {
        let mic = call.getBool("mic") ?? false
        DispatchQueue.main.async {
            let rec = RPScreenRecorder.shared()
            guard rec.isAvailable else { call.resolve(["ok": false, "error": "この端末では画面録画を使えません"]); return }
            rec.isMicrophoneEnabled = mic
            rec.startRecording { err in
                if let err = err {
                    VoxAudioPlugin.nlog("recStart error: \(err.localizedDescription)")
                    call.resolve(["ok": false, "error": err.localizedDescription])
                } else {
                    VoxAudioPlugin.nlog("recStart ok " + VoxAudioPlugin.sessionDesc())
                    call.resolve(["ok": true])
                }
            }
        }
    }

    @objc func recStop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            RPScreenRecorder.shared().stopRecording { preview, err in
                DispatchQueue.main.async {
                    if let p = preview {
                        p.previewControllerDelegate = self
                        p.modalPresentationStyle = .fullScreen
                        self.bridge?.viewController?.present(p, animated: true)
                        VoxAudioPlugin.nlog("recStop → preview")
                        call.resolve(["ok": true])
                    } else {
                        VoxAudioPlugin.nlog("recStop error: \(err?.localizedDescription ?? "no preview")")
                        call.resolve(["ok": false, "error": err?.localizedDescription ?? "no preview"])
                    }
                }
            }
        }
    }

    // ---- pick a video from Photos and return its soundtrack as 16 kHz mono 16-bit WAV (base64) ----
    @objc func pickVideo(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            var cfg = PHPickerConfiguration()
            cfg.filter = .any(of: [.videos])
            cfg.selectionLimit = 1
            cfg.preferredAssetRepresentationMode = .current
            let picker = PHPickerViewController(configuration: cfg)
            picker.delegate = self
            self.pickCall = call
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let call = pickCall else { return }
        pickCall = nil
        guard let item = results.first?.itemProvider else { call.resolve(["ok": false, "cancelled": true]); return }
        let type = item.registeredTypeIdentifiers.first(where: { UTType($0)?.conforms(to: .audiovisualContent) == true }) ?? UTType.movie.identifier
        VoxAudioPlugin.nlog("pickVideo type=\(type) types=\(item.registeredTypeIdentifiers)")
        item.loadFileRepresentation(forTypeIdentifier: type) { url, err in
            guard let url = url else {
                VoxAudioPlugin.nlog("pickVideo load failed: \(err?.localizedDescription ?? "nil")")
                call.resolve(["ok": false, "error": err?.localizedDescription ?? "動画を読み込めませんでした"]); return
            }
            // the provided file is deleted when this handler returns: copy it first
            let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("voxm-src-\(UUID().uuidString).\(url.pathExtension.isEmpty ? "mov" : url.pathExtension)")
            do { try FileManager.default.copyItem(at: url, to: tmp) }
            catch { call.resolve(["ok": false, "error": "コピー失敗: \(error.localizedDescription)"]); return }
            DispatchQueue.global(qos: .userInitiated).async {
                VoxAudioPlugin.extractAudio(url: tmp, call: call)
                try? FileManager.default.removeItem(at: tmp)
            }
        }
    }

    static func extractAudio(url: URL, call: CAPPluginCall) {
        let asset = AVURLAsset(url: url)
        guard let track = asset.tracks(withMediaType: .audio).first else {
            nlog("extract: no audio track")
            call.resolve(["ok": false, "error": "この動画には音声が入っていません"]); return
        }
        let total = CMTimeGetSeconds(asset.duration)
        let dur = min(total.isFinite ? total : 180, 180)
        do {
            let reader = try AVAssetReader(asset: asset)
            reader.timeRange = CMTimeRange(start: .zero, duration: CMTime(seconds: dur, preferredTimescale: 600))
            let settings: [String: Any] = [
                AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 16000, AVNumberOfChannelsKey: 1,
                AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false
            ]
            let out = AVAssetReaderAudioMixOutput(audioTracks: [track], audioSettings: settings)
            out.alwaysCopiesSampleData = false
            guard reader.canAdd(out) else { call.resolve(["ok": false, "error": "音声を読み出せません"]); return }
            reader.add(out)
            guard reader.startReading() else { call.resolve(["ok": false, "error": reader.error?.localizedDescription ?? "読み出し開始に失敗"]); return }
            var pcm = Data()
            while let sb = out.copyNextSampleBuffer() {
                if let bb = CMSampleBufferGetDataBuffer(sb) {
                    let len = CMBlockBufferGetDataLength(bb)
                    var chunk = Data(count: len)
                    chunk.withUnsafeMutableBytes { raw in
                        if let base = raw.baseAddress { _ = CMBlockBufferCopyDataBytes(bb, atOffset: 0, dataLength: len, destination: base) }
                    }
                    pcm.append(chunk)
                }
            }
            if reader.status == .failed { nlog("extract failed: \(reader.error?.localizedDescription ?? "?")") }
            nlog("extract ok bytes=\(pcm.count) dur=\(dur) total=\(total)")
            call.resolve(["ok": true, "sampleRate": 16000, "seconds": Double(pcm.count) / 32000.0, "total": total, "pcm16": pcm.base64EncodedString()])
        } catch {
            nlog("extract error: \(error.localizedDescription)")
            call.resolve(["ok": false, "error": error.localizedDescription])
        }
    }

    public func previewControllerDidFinish(_ previewController: RPPreviewViewController) {
        previewController.dismiss(animated: true)
    }

    @objc func routeChanged(_ n: Notification) {
        let reason = (n.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt) ?? 0
        VoxAudioPlugin.nlog("routeChange reason=\(reason) " + VoxAudioPlugin.sessionDesc())
        DispatchQueue.main.async {
            if !VoxAudioPlugin.headphones() { VoxAudioPlugin.keepOnSpeaker() }
            self.notifyListeners("route", data: ["headphones": VoxAudioPlugin.headphones()])
        }
    }

    @objc func interrupted(_ n: Notification) {
        let type = (n.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt) ?? 99
        let opt = (n.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt) ?? 0
        VoxAudioPlugin.nlog("interruption type=\(type == 1 ? "began" : type == 0 ? "ended" : String(type)) opt=\(opt)")
    }

    @objc func servicesReset(_ n: Notification) {
        VoxAudioPlugin.nlog("mediaServicesWereReset")
    }
}

class VoxBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(VoxAudioPlugin())
    }
}
