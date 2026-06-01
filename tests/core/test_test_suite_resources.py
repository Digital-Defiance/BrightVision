"""Utilization helpers for Test Lab heartbeats."""

from __future__ import annotations

from bright_vision_core.test_suite.resources import (
    UtilizationSample,
    _parse_ioreg_gpu,
    format_util_suffix,
)


def test_parse_ioreg_gpu_device_utilization():
    blob = '"Device Utilization %"=42\n'
    assert _parse_ioreg_gpu(blob) == 42.0


def test_format_util_suffix_orders_cpu_gpu_ram():
    text = format_util_suffix(
        UtilizationSample(cpu_pct=12.5, gpu_pct=88.0, mem_pct=64.0)
    )
    assert "CPU 12%" in text
    assert "GPU 88%" in text
    assert "RAM 64%" in text


def test_format_util_suffix_empty_when_no_samples():
    assert format_util_suffix(UtilizationSample()) == ""
