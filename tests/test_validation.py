import unittest
from datetime import datetime, timedelta, timezone

from agent.security.validation import build_metric, calculate_network_throughput, ensure_valid_metric, mark_if_stale


class ValidationTests(unittest.TestCase):
    def test_metric_building_and_null_rejection(self):
        metric = build_metric(
            device_id='device-1',
            metric='cpu_usage',
            value=None,
            unit='%',
            source='windows-agent',
            timestamp=datetime.now(timezone.utc),
            status='unavailable',
            error='No valid sample available',
        )
        validated = ensure_valid_metric(metric)
        self.assertIsNone(validated['value'])
        self.assertEqual(validated['status'], 'unavailable')

    def test_stale_data_detection(self):
        now = datetime.now(timezone.utc)
        stale_metric = build_metric(
            device_id='device-1',
            metric='memory_usage_percent',
            value=66,
            unit='%',
            source='windows-agent',
            timestamp=now - timedelta(minutes=5),
            status='available',
        )
        updated = mark_if_stale(stale_metric, 120, now)
        self.assertEqual(updated['status'], 'stale')

    def test_network_throughput(self):
        throughput = calculate_network_throughput(1500, 1.0)
        self.assertAlmostEqual(throughput, 12000.0)

    def test_supported_values(self):
        metric = build_metric(
            device_id='device-1',
            metric='memory_total',
            value=16,
            unit='GB',
            source='windows-agent',
            timestamp=datetime.now(timezone.utc),
            status='available',
        )
        self.assertEqual(metric['unit'], 'GB')
        self.assertEqual(metric['status'], 'available')


if __name__ == '__main__':
    unittest.main()
