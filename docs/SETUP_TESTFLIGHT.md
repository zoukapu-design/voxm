# GitHub → TestFlight セットアップ手順（Mac・Codemagic不要）

ビルドは GitHub の Mac（GitHub Actions の `macos-26`）で行い、そのまま TestFlight にアップロードします。
Public リポジトリなら GitHub Actions は無料です。

---

## 1. GitHub にリポジトリを作る（2分）

1. https://github.com/new を開く
2. Owner: `zoukapu-design` / Repository name: **`voxm`**
3. **Public** を選ぶ
4. README・.gitignore・License は **すべて追加しない**（空のまま）
5. **Create repository**

> Claude にコードを push させる場合：GitHub の「Claude」アプリのアクセス設定で、対象リポジトリに `voxm` を追加してください（設定 → Applications → Claude → Configure → Repository access）。

---

## 2. Apple 側の準備（10分・初回のみ）

### 2-1. Bundle ID を登録
1. https://developer.apple.com/account/resources/identifiers/list → **＋**
2. **App IDs** → **App** → Continue
3. Description: `VOXM` / Bundle ID: **Explicit** `com.zoukapu.voxm`
4. Capabilities は何もチェックしなくてOK → Register

### 2-2. App Store Connect にアプリを作る
1. https://appstoreconnect.apple.com/apps → **＋** → **新規App**
2. プラットフォーム: iOS / 名前: `VOXM`（使われていたら `VOXM Voice Memory` など）
3. 言語: 日本語 / バンドルID: `com.zoukapu.voxm` / SKU: `voxm`

### 2-3. API キーを作る（ビルドと署名を自動化するカギ）
1. App Store Connect → **ユーザとアクセス** → **統合** → **App Store Connect API** → **チームキー**
2. **＋** でキーを生成。名前: `github-actions` / アクセス: **Admin**
   - ※ 署名用の証明書を自動で作るため **Admin が必要** です（App Manager だと失敗します）
3. **APIキーをダウンロード**（`AuthKey_XXXXXXXXXX.p8`）— **1回しかダウンロードできません**
4. 画面に出ている **キーID** と **Issuer ID** をメモ

### 2-4. Team ID を確認
https://developer.apple.com/account → **メンバーシップの詳細** → **チームID**（10桁の英数字）

---

## 3. GitHub に秘密情報を登録（3分）

リポジトリの **Settings → Secrets and variables → Actions → New repository secret** で4つ追加：

| Name | 値 |
|---|---|
| `APPLE_TEAM_ID` | チームID（例 `AB12CD34EF`） |
| `ASC_KEY_ID` | API のキーID |
| `ASC_ISSUER_ID` | Issuer ID（ハイフン入りの長いID） |
| `ASC_KEY_P8` | `.p8` ファイルをメモ帳で開き、`-----BEGIN PRIVATE KEY-----` から `-----END PRIVATE KEY-----` まで**全部**コピペ |

> Public リポジトリでも Secrets は外部から見えません。**.p8 ファイル自体は絶対にリポジトリに入れない**でください（.gitignore 済み）。

（任意）**Variables** タブで `APP_VERSION`（例 `2.0.0`）や `BUNDLE_ID` を変更できます。

---

## 4. Web版（GitHub Pages）を有効にする（1分）

**Settings → Pages → Build and deployment → Source: GitHub Actions**

main に push されるたびに `https://zoukapu-design.github.io/voxm/` が更新されます。
iPhone の Safari で開けば、TestFlight を待たずにマイク変換を試せます。

---

## 5. TestFlight にビルドを上げる

1. リポジトリの **Actions** タブ → 左の **iOS TestFlight** → **Run workflow**
2. 15〜25分ほどで緑のチェック ✓
3. App Store Connect → アプリ → **TestFlight** に、Apple の処理後（10〜30分）にビルドが出る
4. **内部テスト** → グループを作り自分を追加 → iPhone の **TestFlight アプリ** からインストール

次から：コードを更新したら **Run workflow** を押すだけ（ビルド番号は自動で増えます）。
`git tag v2.0.1 && git push --tags` でも自動で走ります。

---

## うまくいかないとき

| 症状（Actions のログ） | 対処 |
|---|---|
| `GitHub secret ... is not set` | 手順3の Secrets 名のつづりを確認 |
| `No profiles for 'com.zoukapu.voxm'` / `No Accounts` | API キーのアクセスが **Admin** か、Bundle ID 登録（2-1）を確認 |
| `Cloud signing permission error` | 同上（Admin 権限が必要） |
| `The bundle version must be higher` | もう一度 Run workflow（番号が自動で上がります） |
| `Missing Compliance` で止まる | 設定済み（暗号化なし）なので通常出ません。出たら App Store Connect で「いいえ」を選択 |

ログの赤い部分をそのまま Claude に貼ってもらえれば修正します。
