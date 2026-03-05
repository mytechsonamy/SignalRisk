/**
 * Unit tests for ProxyDetector
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProxyDetector } from '../proxy-detector';

describe('ProxyDetector', () => {
  describe('isDatacenterIp', () => {
    let detector: ProxyDetector;

    beforeEach(() => {
      detector = new ProxyDetector();
    });

    it('should return true for DigitalOcean ASN', () => {
      expect(detector.isDatacenterIp('AS14061')).toBe(true);
    });

    it('should return true for AWS ASN', () => {
      expect(detector.isDatacenterIp('AS16509')).toBe(true);
    });

    it('should return true for Google Cloud ASN', () => {
      expect(detector.isDatacenterIp('AS15169')).toBe(true);
    });

    it('should return true for Microsoft Azure ASN', () => {
      expect(detector.isDatacenterIp('AS8075')).toBe(true);
    });

    it('should return true for Cloudflare ASN', () => {
      expect(detector.isDatacenterIp('AS13335')).toBe(true);
    });

    it('should return true for ASN without AS prefix (numeric)', () => {
      expect(detector.isDatacenterIp('14061')).toBe(true);
    });

    it('should return true for lowercase ASN', () => {
      expect(detector.isDatacenterIp('as14061')).toBe(true);
    });

    it('should return false for a random/residential ASN', () => {
      expect(detector.isDatacenterIp('AS12345')).toBe(false);
    });

    it('should return false for undefined ASN', () => {
      expect(detector.isDatacenterIp(undefined)).toBe(false);
    });

    it('should return false for empty string ASN', () => {
      expect(detector.isDatacenterIp('')).toBe(false);
    });
  });

  describe('isTorExitNode', () => {
    describe('with a populated Tor exit node file', () => {
      let detector: ProxyDetector;
      let tmpFile: string;

      beforeEach(() => {
        // Write a temporary Tor exit node file
        tmpFile = path.join(os.tmpdir(), `tor-exit-nodes-test-${Date.now()}.txt`);
        fs.writeFileSync(tmpFile, '1.2.3.4\n5.6.7.8\n# comment line\n10.0.0.1\n');
        detector = new ProxyDetector(tmpFile);
      });

      afterEach(() => {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      });

      it('should return true for a known Tor exit node IP', () => {
        expect(detector.isTorExitNode('1.2.3.4')).toBe(true);
      });

      it('should return true for another known Tor exit node IP', () => {
        expect(detector.isTorExitNode('5.6.7.8')).toBe(true);
      });

      it('should return false for an IP not in the Tor list', () => {
        expect(detector.isTorExitNode('9.9.9.9')).toBe(false);
      });

      it('should ignore comment lines in the Tor list', () => {
        expect(detector.isTorExitNode('# comment line')).toBe(false);
      });
    });

    describe('with no Tor exit node file', () => {
      let detector: ProxyDetector;

      beforeEach(() => {
        detector = new ProxyDetector('/nonexistent/path/to/tor-exit-nodes.txt');
      });

      it('should return false when file does not exist', () => {
        expect(detector.isTorExitNode('1.2.3.4')).toBe(false);
      });
    });

    describe('edge cases', () => {
      let detector: ProxyDetector;

      beforeEach(() => {
        detector = new ProxyDetector();
      });

      it('should return false for empty string IP', () => {
        expect(detector.isTorExitNode('')).toBe(false);
      });
    });
  });

  describe('isKnownProxy', () => {
    let detector: ProxyDetector;

    beforeEach(() => {
      detector = new ProxyDetector();
    });

    it('should return true for an IP in the known proxy CIDR range (198.51.100.x)', () => {
      expect(detector.isKnownProxy('198.51.100.1')).toBe(true);
    });

    it('should return true for an IP in the 203.0.113.x range', () => {
      expect(detector.isKnownProxy('203.0.113.50')).toBe(true);
    });

    it('should return false for a normal public IP', () => {
      expect(detector.isKnownProxy('8.8.8.8')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(detector.isKnownProxy('')).toBe(false);
    });

    it('should return false for non-IPv4 addresses', () => {
      expect(detector.isKnownProxy('2001:db8::1')).toBe(false);
    });

    it('should return false for localhost', () => {
      expect(detector.isKnownProxy('127.0.0.1')).toBe(false);
    });
  });
});
