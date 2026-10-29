#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LM-Detector 提示词与样本库一键同步更新脚本
该脚本从 https://github.com/Ikaleio/lm-detector 获取最新的模型指纹提示词模板、
参考模型库 (unified_bank) 和检测器权重 (shared_detector.bin)，并生成纯前端离线
直接可用的 js/lm_detector_data.js 静态文件，同时自动为 index.html 增加版本号以防浏览器强缓存。
"""

import os
import sys
import re
import json
import base64
import urllib.request
import urllib.error
import argparse
from datetime import datetime
from pathlib import Path

# 确保在 Windows 控制台环境下输出 UTF-8
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# 上游默认资源地址（GitHub raw 与 jsDelivr 镜像兜底）
REMOTE_SOURCES = [
    {
        "name": "GitHub Raw",
        "templates": "https://raw.githubusercontent.com/Ikaleio/lm-detector/main/sdk/conformance/templates.json",
        "bank": "https://raw.githubusercontent.com/Ikaleio/lm-detector/main/data/unified_bank.json",
        "detector": "https://raw.githubusercontent.com/Ikaleio/lm-detector/main/data/shared_detector.bin",
    },
    {
        "name": "jsDelivr CDN",
        "templates": "https://cdn.jsdelivr.net/gh/Ikaleio/lm-detector@main/sdk/conformance/templates.json",
        "bank": "https://cdn.jsdelivr.net/gh/Ikaleio/lm-detector@main/data/unified_bank.json",
        "detector": "https://cdn.jsdelivr.net/gh/Ikaleio/lm-detector@main/data/shared_detector.bin",
    }
]

def fetch_url(url: str, timeout: int = 30) -> bytes:
    """使用 urllib 从网络获取二进制数据"""
    headers = {
        "User-Agent": "ModelInspector-Sync/1.0 (https://github.com/Ikaleio/lm-detector)"
    }
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if resp.status != 200:
            raise RuntimeError(f"HTTP 请求失败: 状态码 {resp.status}")
        return resp.read()

def load_data_from_local(local_dir: Path):
    """从本地已克隆的 lm-detector 目录读取数据"""
    templates_path = local_dir / "sdk" / "conformance" / "templates.json"
    bank_path = local_dir / "data" / "unified_bank.json"
    detector_path = local_dir / "data" / "shared_detector.bin"

    if not templates_path.exists() or not bank_path.exists() or not detector_path.exists():
        raise FileNotFoundError(f"本地目录 {local_dir} 缺少必要的数据文件")

    print(f"[*] 正在从本地目录读取数据: {local_dir}")
    templates_bytes = templates_path.read_bytes()
    bank_bytes = bank_path.read_bytes()
    detector_bytes = detector_path.read_bytes()
    return templates_bytes, bank_bytes, detector_bytes

def load_data_from_remote():
    """从上游网络仓库下载数据"""
    last_err = None
    for src in REMOTE_SOURCES:
        name = src["name"]
        print(f"[*] 尝试从 {name} 获取数据...")
        try:
            print(f"  - 正在获取提示词模板: {src['templates']}")
            templates_bytes = fetch_url(src["templates"])
            print(f"  - 正在获取模型样本库: {src['bank']}")
            bank_bytes = fetch_url(src["bank"])
            print(f"  - 正在获取模型指纹检测器: {src['detector']}")
            detector_bytes = fetch_url(src["detector"])
            return templates_bytes, bank_bytes, detector_bytes
        except Exception as e:
            print(f"  [!] {name} 获取失败: {e}")
            last_err = e
            continue
    raise RuntimeError(f"所有网络源均获取失败，最后错误: {last_err}")

def format_version_tag(built_at: str) -> str:
    """从 built_at 时间提取精简易读的版本标识 (如 20261027_050250)"""
    if built_at:
        clean = re.sub(r'[^0-9a-zA-Z]', '', built_at)
        if len(clean) >= 15 and clean[:8].isdigit():
            return f"{clean[:8]}_{clean[9:15]}"
        elif len(clean) >= 8 and clean[:8].isdigit():
            return clean[:8]
    return datetime.now().strftime("%Y%m%d_%H%M%S")

def update_index_html(index_html_path: Path, version_tag: str):
    """自动将 index.html 中的 lm_detector_data.js 引用增加/更新版本号，防止浏览器缓存"""
    if not index_html_path.exists():
        print(f"  [!] 未找到 HTML 文件: {index_html_path}，跳过版本号注入。")
        return False

    html_content = index_html_path.read_text(encoding="utf-8")
    # 匹配 <script src="js/lm_detector_data.js"></script> 或带有 ?v=... 的标签
    pattern = r'(<script\s+src=["\']js/lm_detector_data\.js)(?:\?[^"\']*)?(["\']\s*></script>)'
    replacement = rf'\g<1>?v={version_tag}\g<2>'

    new_html, count = re.subn(pattern, replacement, html_content)
    if count > 0:
        index_html_path.write_text(new_html, encoding="utf-8")
        print(f"  ✓ 已同步更新 {index_html_path.name} 引用版本号 -> ?v={version_tag}")
        return True
    else:
        print(f"  [!] 在 {index_html_path.name} 中未找到 lm_detector_data.js 引用标签，跳过。")
        return False

def main():
    parser = argparse.ArgumentParser(description="更新 LM-Detector 提示词与模型样本库到本项目")
    parser.add_argument("--source", type=str, help="指定本地 lm-detector 仓库路径进行同步（离线模式）")
    parser.add_argument("--output", type=str, default="js/lm_detector_data.js", help="输出 JS 文件路径 (默认 js/lm_detector_data.js)")
    parser.add_argument("--html", type=str, default="index.html", help="HTML 主文件路径 (默认 index.html，更新时自动同步版本号以防缓存)")
    parser.add_argument("--no-html-update", action="store_true", help="跳过自动更新 HTML 中的版本号")
    args = parser.parse_args()

    print("=" * 60)
    print(" 🚀 LM-Detector 提示词与模型指纹样本库更新工具")
    print("=" * 60)

    # 1. 尝试数据源获取
    templates_bytes = None
    bank_bytes = None
    detector_bytes = None

    if args.source:
        local_dir = Path(args.source)
        templates_bytes, bank_bytes, detector_bytes = load_data_from_local(local_dir)
    else:
        # 优先检查本地是否存在 scratch/lm-detector-repo 缓存
        scratch_dir = Path(__file__).parent / "scratch" / "lm-detector-repo"
        if scratch_dir.exists() and (scratch_dir / "data" / "shared_detector.bin").exists():
            print(f"[*] 检测到本地存在缓存仓库: {scratch_dir}，优先直接读取...")
            try:
                templates_bytes, bank_bytes, detector_bytes = load_data_from_local(scratch_dir)
            except Exception as e:
                print(f"[!] 本地缓存读取异常: {e}，将尝试在线下载...")
        
        if templates_bytes is None:
            templates_bytes, bank_bytes, detector_bytes = load_data_from_remote()

    # 2. 解析与精简数据
    print("[*] 正在解析与校验数据内容...")
    templates_json = json.loads(templates_bytes.decode("utf-8"))
    bank_json = json.loads(bank_bytes.decode("utf-8"))

    # 提取多语言提示词模板
    languages = templates_json.get("languages", [])
    if isinstance(languages, list):
        lang_dict = {item.get("id", f"lang_{i}"): item for i, item in enumerate(languages)}
    else:
        lang_dict = languages

    # 提取模型基础信息 (仅保留前端排版评分必需的最小集合：id, display_name, family, family_name, response_count)
    raw_models = bank_json.get("models", [])
    models = []
    for m in raw_models:
        models.append({
            "id": m.get("id"),
            "display_name": m.get("display_name") or m.get("id"),
            "family": m.get("family") or "",
            "family_name": m.get("family_name") or "",
            "response_count": m.get("response_count", 0)
        })

    built_at = bank_json.get("built_at", "")
    print(f"  ✓ 提示词语言包数量: {len(lang_dict)} 种")
    print(f"  ✓ 样本库覆盖模型数量: {len(models)} 个")
    print(f"  ✓ 样本库构建版本时间 (built_at): {built_at}")

    # 将 4.5MB 二进制权重编码为 Base64，以实现零后端、零跨域限制直接嵌入纯前端
    print("[*] 正在对检测器权重执行 Base64 编码...")
    detector_b64 = base64.b64encode(detector_bytes).decode("ascii")
    print(f"  ✓ 原始权重尺寸: {len(detector_bytes):,} 字节, Base64 尺寸: {len(detector_b64):,} 字符")

    # 3. 生成输出 JS 文件
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"[*] 正在写入输出文件: {output_path}...")
    js_content = f"""// =========================================================================
// LM-Detector 提示词与模型指纹参考样本库数据包 (离线本地化构建)
// 来源项目: https://github.com/Ikaleio/lm-detector
// 构建版本: {built_at}
// 模型数量: {len(models)}
// 自动生成时间: {os.environ.get('BUILD_TIME', 'Latest')}
// 注意: 本文件由 update_detector_data.py 自动生成，请勿手动修改
// =========================================================================

var __LM_DETECTOR_DATA__ = {{
  built_at: {json.dumps(built_at, ensure_ascii=False)},
  models: {json.dumps(models, ensure_ascii=False)},
  templates: {json.dumps(lang_dict, ensure_ascii=False)},
  detector_b64: {json.dumps(detector_b64)}
}};

if (typeof window !== 'undefined') {{
  window.__LM_DETECTOR_DATA__ = __LM_DETECTOR_DATA__;
}}
if (typeof global !== 'undefined') {{
  global.__LM_DETECTOR_DATA__ = __LM_DETECTOR_DATA__;
}}
"""
    output_path.write_text(js_content, encoding="utf-8")
    file_size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"✅ 成功更新并生成: {output_path} (文件大小: {file_size_mb:.2f} MB)")

    # 4. 同步更新 HTML 引用版本号 (Cache Busting)
    version_tag = format_version_tag(built_at)
    print(f"[*] 正在检查并更新 HTML 资源引用版本号 (防浏览器强缓存)...")
    if not args.no_html_update:
        html_path = Path(args.html)
        if not html_path.is_absolute():
            html_path = Path(__file__).parent / html_path
        update_index_html(html_path, version_tag)
    else:
        print("  - 已通过 --no-html-update 跳过 HTML 更新。")

    print("=" * 60)
    print(f"🎉 恭喜！更新已完成。index.html 已同步版本号 (?v={version_tag})，浏览器刷新即可立即加载最新指纹库！")
    print("=" * 60)

if __name__ == "__main__":
    main()
