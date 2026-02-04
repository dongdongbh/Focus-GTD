<div align="center">

<img src="apps/mobile/assets/images/icon.png" width="120" alt="Mindwtr Logo">

# Mindwtr

中文 | [English](./README.md)

完整的 GTD（Getting Things Done）生产力系统，覆盖桌面与移动端。*Mind Like Water.*

*GTD 新手？可阅读 [15 分钟入门 GTD](https://hamberg.no/gtd)。*

[![CI](https://github.com/dongdongbh/Mindwtr/actions/workflows/ci.yml/badge.svg)](https://github.com/dongdongbh/Mindwtr/actions/workflows/ci.yml)
[![GitHub license](https://img.shields.io/github/license/dongdongbh/Mindwtr?color=brightgreen)](LICENSE)
[![GitHub downloads](https://img.shields.io/github/downloads/dongdongbh/Mindwtr/total)](https://github.com/dongdongbh/Mindwtr/releases)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/MrrkRsm8)
[![X Share](https://img.shields.io/badge/X-Share-111111?logo=X&logoColor=white)](https://x.com/intent/post?text=Mindwtr%20https%3A%2F%2Fgithub.com%2Fdongdongbh%2FMindwtr)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-GitHub-ff5f5f?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/dongdongbh)
[![Ko-fi](https://img.shields.io/badge/Sponsor-Ko--fi-29abe0?logo=kofi&logoColor=white)](https://ko-fi.com/D1D01T20WK)

<p align="center" style="text-align: center;">
  <a href="https://apps.microsoft.com/detail/9n0v5b0b6frx?ocid=webpdpshare" target="_blank">
    <img src="https://developer.microsoft.com/store/badges/images/English_get-it-from-MS.png"
         align="center"
         alt="Microsoft Store"
         style="height: 50px"
         height="50" />
  </a>
  <a href="https://play.google.com/store/apps/details?id=tech.dongdongbh.mindwtr" target="_blank">
    <img src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
         align="center"
         alt="Google Play"
         style="height: 56px"
         height="56" />
  </a>
  <a href="https://snapcraft.io/mindwtr" target="_blank">
    <img alt="Get it from the Snap Store"
         src="https://snapcraft.io/static/images/badges/en/snap-store-black.svg"
         align="center"
         style="height: 50px"
         height="50" />
  </a>
</p>

</div>

<div align="center">
  <video src="https://github.com/user-attachments/assets/8b067635-196e-4c9c-ad26-92ca92fef327" width="60%" autoplay loop muted playsinline></video>
  
  <video src="https://github.com/user-attachments/assets/08e4f821-0b1c-44f9-af58-0b727bc2bd91" width="25%" autoplay loop muted playsinline></video>

  <p>
    <i>Arch Linux 与 Android 上的本地优先 GTD</i>
  </p>
</div>

## 理念

Mindwtr **默认简单，需要时也足够强大**。我们专注于降低认知负担、删繁就简，让你保持顺畅的工作流：

- **渐进式揭示**：高级选项在需要时才出现。
- **默认更少**：更少字段、更少按钮、更少干扰。
- **避免功能膨胀**：保持清爽与克制。

*我只是想骑车，不要给我驾驶舱。*

## 功能

### GTD 工作流
- **收集** - 随时快速添加任务（全局快捷键、托盘、分享、语音）
- **澄清** - 2 分钟法则引导的收件箱处理
- **组织** - 项目、情境与状态清单
- **回顾** - 带提醒的每周回顾向导
- **执行** - 基于情境筛选的下一步行动
- **AI 辅助（可选）** - 使用自带密钥的 AI 完成澄清、拆解与回顾（OpenAI、Gemini、Claude）

### 视图
- 📥 **收件箱** - 任务收集区与处理向导
- 🎯 **聚焦** - 日程（时间维度）+ 下一步行动合并视图
- 📁 **项目** - 带领域的多步骤成果
- 🏷️ **情境** - 层级情境（@work/meetings）
- ⏳ **等待中** - 委派事项
- 💭 **将来/也许** - 延后想法
- 📅 **日历** - 基于时间的规划
- 📋 **看板** - 看板式拖拽
- 📝 **回顾** - 每日 + 每周回顾流程
- 📦 **归档** - 隐藏历史，按需搜索

### 生产力功能
- 🔍 **全局搜索** - 搜索操作符（status:, context:, due:<=7d）
- 📦 **批量操作** - 多选、批量移动/打标签/删除
- 📎 **附件** - 任务支持文件与链接
- ✏️ **Markdown 备注** - 富文本描述与预览
- 🗂️ **项目状态** - 进行中、等待中、将来/也许、归档
- ♾️ **流动重复** - 固定日期或“完成后 X 天”
- ♻️ **可复用清单** - 复制任务或重置清单
- ✅ **清单模式** - 清单任务快速勾选
- ✅ **语音收集** - 语音快速记录、自动转写并创建任务
- 🧭 **Copilot 建议** - 可选的情境/标签/时间提示
- 🔔 **通知** - 截止提醒与稍后提醒
- 📊 **每日摘要** - 早间简报 + 晚间回顾
- 📅 **每周回顾** - 可定制的每周提醒

### 数据与同步
- 📁 **文件同步** - Dropbox、Google Drive、Syncthing 等
- 🌐 **WebDAV 同步** - Nextcloud、ownCloud、自建
- 📤 **导出/备份** - 导出 JSON 数据
- 🗓️ **外部日历（ICS）** - 只读日历叠加

### 自动化
- 🔌 **CLI** - 终端添加/列出/完成/搜索
- 🌐 **REST API** - 本地 API 便于脚本化
- 🌍 **Web 应用（PWA）** - 浏览器离线访问
- 🧠 **MCP 服务器** - 本地 Model Context Protocol 服务用于 LLM 自动化

### 跨平台
- 🖥️ **桌面端** - Tauri v2（macOS、Linux、Windows）
- 📱 **移动端** - React Native/Expo（iOS 通过 TestFlight、Android）
- 📲 **Android 小部件** - 桌面焦点/下一步小组件
- ⌨️ **键盘快捷键** - Vim 与 Emacs 预设
- 🎨 **主题** - 明/暗模式
- 🌍 **国际化** - 英文、中文、西班牙语、印地语、阿拉伯语、德语、俄语、日语、法语、葡萄牙语、韩语、意大利语、土耳其语
- 🐳 **Docker** - 使用 Docker 运行 PWA + 自托管同步服务

## 安装

### 桌面端（Linux）

**Arch Linux（AUR）：**
<a href="https://aur.archlinux.org/packages/mindwtr-bin">
  <img src="https://img.shields.io/aur/version/mindwtr-bin?logo=arch-linux&logoColor=white&color=1793d1&label=AUR" alt="AUR Version">
</a>

```bash
# 使用 yay
yay -S mindwtr-bin

# 使用 paru
paru -S mindwtr-bin
```

**Debian / Ubuntu（APT 仓库，推荐）：**
```bash
curl -fsSL https://dongdongbh.github.io/Mindwtr/mindwtr.gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/mindwtr-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/mindwtr-archive-keyring.gpg] https://dongdongbh.github.io/Mindwtr/deb ./" | sudo tee /etc/apt/sources.list.d/mindwtr.list
sudo apt update
sudo apt install mindwtr
```

**Fedora / RHEL / openSUSE（DNF/YUM 仓库，推荐）：**
```bash
cat <<'EOF' | sudo tee /etc/yum.repos.d/mindwtr.repo
[mindwtr]
name=Mindwtr Repository
baseurl=https://dongdongbh.github.io/Mindwtr/rpm
enabled=1
gpgcheck=0
EOF

sudo dnf install mindwtr
```

**Snapcraft：**
<a href="https://snapcraft.io/mindwtr">
  <img src="https://img.shields.io/badge/Snapcraft-Install-82BEA0?logo=snapcraft&logoColor=white" alt="Snapcraft">
</a>
```bash
sudo snap install mindwtr
```

**其他方式：** 从 [GitHub Releases](https://github.com/dongdongbh/Mindwtr/releases) 获取 AppImage 或 `.deb` / `.rpm`。

### 桌面端（Windows）

**Microsoft Store（推荐）：**
<a href="https://apps.microsoft.com/detail/9n0v5b0b6frx?ocid=webpdpshare">
  <img src="https://img.shields.io/badge/Microsoft_Store-Install-0078D6?logo=microsoft&logoColor=white" alt="Microsoft Store">
</a>

**Winget：**
<a href="https://winstall.app/apps/dongdongbh.Mindwtr">
  <img src="https://img.shields.io/winget/v/dongdongbh.Mindwtr?label=Winget&logo=windows&logoColor=white&color=00D2FF" alt="Winget Version">
</a>
```powershell
winget install dongdongbh.Mindwtr
```

**Scoop：**
<a href="https://github.com/dongdongbh/homebrew-mindwtr">
  <img src="https://img.shields.io/scoop/v/mindwtr?bucket=https://github.com/dongdongbh/homebrew-mindwtr&label=Scoop&logo=scoop&logoColor=white&color=E6E6E6" alt="Scoop Version">
</a>
```powershell
scoop bucket add mindwtr https://github.com/dongdongbh/homebrew-mindwtr
scoop install mindwtr
```

**其他方式：** 从 [GitHub Releases](https://github.com/dongdongbh/Mindwtr/releases) 获取 `.msi` / `.exe`。

### 桌面端（macOS）

**Homebrew（推荐）：**
<a href="https://github.com/dongdongbh/homebrew-mindwtr">
  <img src="https://img.shields.io/badge/Homebrew-Install-orange?logo=homebrew&logoColor=white" alt="Homebrew">
</a>
```bash
brew tap dongdongbh/mindwtr
brew install --cask mindwtr
```

**其他方式：** 从 [GitHub Releases](https://github.com/dongdongbh/Mindwtr/releases) 获取 `.dmg`。

> **注意：** 如果 macOS 提示应用“已损坏”或“来自未知开发者”，请执行：
> ```bash
> xattr -cr /Applications/Mindwtr.app
> ```
> 然后正常打开即可。该步骤是因为应用尚未进行苹果公证。

### 移动端

**Android：**
<a href="https://play.google.com/store/apps/details?id=tech.dongdongbh.mindwtr">
  <img src="https://img.shields.io/badge/Google_Play-Install-414141?logo=googleplay&logoColor=white" alt="Get it on Google Play">
</a>

其他方式：从 [GitHub Releases](https://github.com/dongdongbh/Mindwtr/releases) 下载 APK。

**iOS：**
已上线 TestFlight：[加入测试版](https://testflight.apple.com/join/7SMJCTSR)。

不过，维护 iOS 版上架 App Store 需要支付较高的年费（参考 [Apple Developer Program](https://developer.apple.com/support/enrollment/)），目前由我自费承担。

为了让 Mindwtr 能持续发展和维护，非常感谢你的支持！如果你觉得这款应用有价值，欢迎通过 [GitHub Sponsors](https://github.com/sponsors/dongdongbh) 或 [Ko-fi](https://ko-fi.com/D1D01T20WK) 支持项目。

### Docker（PWA + 云同步）

使用 Docker 运行 Web 应用（PWA）和自托管同步服务：
- 指南：[`docker/README.md`](docker/README.md)

安装指南：
- 🚀 [快速开始](https://github.com/dongdongbh/Mindwtr/wiki/Getting-Started)
- 📚 [全平台与包管理器](https://github.com/dongdongbh/Mindwtr/wiki)

## 路线图

- 📦 上架 Flathub
- 🤖 上架 F-Droid
- 📱 iOS 正式发布
- ✉️ 邮件添加到收件箱

## 文档

- 📚 [Wiki](https://github.com/dongdongbh/Mindwtr/wiki) - 完整用户指南
- 🚀 [快速开始](https://github.com/dongdongbh/Mindwtr/wiki/Getting-Started)
- ❓ [FAQ](https://github.com/dongdongbh/Mindwtr/wiki/FAQ)
- 🔄 [数据与同步](https://github.com/dongdongbh/Mindwtr/wiki/Data-and-Sync)
