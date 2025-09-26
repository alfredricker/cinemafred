#!/usr/bin/env tsx

import { spawn } from 'child_process';

export interface GPUCapabilities {
  hasNVIDIA: boolean;
  hasAMD: boolean;
  hasIntel: boolean;
  nvencSupport: boolean;
  vaapiSupport: boolean;
  qsvSupport: boolean;
  recommendedEncoder: string;
  details: {
    nvidia?: string[];
    amd?: string[];
    intel?: string[];
    ffmpegEncoders?: string[];
  };
}

export class GPUDetector {
  /**
   * Detect available GPU hardware and encoding capabilities
   */
  async detectCapabilities(): Promise<GPUCapabilities> {
    console.log('🔍 Detecting GPU capabilities...');
    
    const capabilities: GPUCapabilities = {
      hasNVIDIA: false,
      hasAMD: false,
      hasIntel: false,
      nvencSupport: false,
      vaapiSupport: false,
      qsvSupport: false,
      recommendedEncoder: 'libx264', // Default to CPU
      details: {}
    };

    try {
      // Check for NVIDIA GPUs
      capabilities.details.nvidia = await this.detectNVIDIA();
      capabilities.hasNVIDIA = capabilities.details.nvidia.length > 0;

      // Check for AMD GPUs
      capabilities.details.amd = await this.detectAMD();
      capabilities.hasAMD = capabilities.details.amd.length > 0;

      // Check for Intel GPUs
      capabilities.details.intel = await this.detectIntel();
      capabilities.hasIntel = capabilities.details.intel.length > 0;

      // Check FFmpeg encoder support
      capabilities.details.ffmpegEncoders = await this.detectFFmpegEncoders();

      // Determine specific encoder support
      capabilities.nvencSupport = capabilities.hasNVIDIA && 
        capabilities.details.ffmpegEncoders.some(enc => enc.includes('nvenc'));
      
      capabilities.vaapiSupport = (capabilities.hasAMD || capabilities.hasIntel) && 
        capabilities.details.ffmpegEncoders.some(enc => enc.includes('vaapi'));
      
      capabilities.qsvSupport = capabilities.hasIntel && 
        capabilities.details.ffmpegEncoders.some(enc => enc.includes('qsv'));

      // Determine recommended encoder
      capabilities.recommendedEncoder = this.getRecommendedEncoder(capabilities);

      this.logCapabilities(capabilities);
      return capabilities;

    } catch (error) {
      console.warn('⚠️  GPU detection failed, falling back to CPU encoding:', error);
      return capabilities;
    }
  }

  /**
   * Detect NVIDIA GPUs using nvidia-smi
   */
  private async detectNVIDIA(): Promise<string[]> {
    try {
      const output = await this.runCommand('nvidia-smi', ['--query-gpu=name,driver_version', '--format=csv,noheader,nounits']);
      return output.split('\n').filter(line => line.trim()).map(line => line.trim());
    } catch {
      return [];
    }
  }

  /**
   * Detect AMD GPUs using lspci
   */
  private async detectAMD(): Promise<string[]> {
    try {
      const output = await this.runCommand('lspci', ['-nn']);
      const amdLines = output.split('\n').filter(line => 
        line.toLowerCase().includes('amd') && 
        (line.toLowerCase().includes('vga') || line.toLowerCase().includes('display'))
      );
      return amdLines.map(line => line.trim());
    } catch {
      return [];
    }
  }

  /**
   * Detect Intel GPUs using lspci
   */
  private async detectIntel(): Promise<string[]> {
    try {
      const output = await this.runCommand('lspci', ['-nn']);
      const intelLines = output.split('\n').filter(line => 
        line.toLowerCase().includes('intel') && 
        (line.toLowerCase().includes('vga') || line.toLowerCase().includes('display'))
      );
      return intelLines.map(line => line.trim());
    } catch {
      return [];
    }
  }

  /**
   * Detect available FFmpeg encoders
   */
  private async detectFFmpegEncoders(): Promise<string[]> {
    try {
      const output = await this.runCommand('ffmpeg', ['-encoders']);
      const lines = output.split('\n');
      const encoderLines = lines.filter(line => 
        line.includes('h264') || 
        line.includes('nvenc') || 
        line.includes('vaapi') || 
        line.includes('qsv')
      );
      return encoderLines.map(line => line.trim());
    } catch {
      return [];
    }
  }

  /**
   * Get recommended encoder based on capabilities
   */
  private getRecommendedEncoder(capabilities: GPUCapabilities): string {
    // Priority: NVENC > QSV > VAAPI > CPU
    if (capabilities.nvencSupport) {
      return 'h264_nvenc';
    } else if (capabilities.qsvSupport) {
      return 'h264_qsv';
    } else if (capabilities.vaapiSupport) {
      return 'h264_vaapi';
    } else {
      return 'libx264';
    }
  }

  /**
   * Log detected capabilities
   */
  private logCapabilities(capabilities: GPUCapabilities): void {
    console.log('\n🎯 GPU Detection Results:');
    console.log(`   NVIDIA GPU: ${capabilities.hasNVIDIA ? '✅' : '❌'}`);
    if (capabilities.hasNVIDIA && capabilities.details.nvidia) {
      capabilities.details.nvidia.forEach(gpu => console.log(`     - ${gpu}`));
    }
    
    console.log(`   AMD GPU: ${capabilities.hasAMD ? '✅' : '❌'}`);
    if (capabilities.hasAMD && capabilities.details.amd) {
      capabilities.details.amd.forEach(gpu => console.log(`     - ${gpu}`));
    }
    
    console.log(`   Intel GPU: ${capabilities.hasIntel ? '✅' : '❌'}`);
    if (capabilities.hasIntel && capabilities.details.intel) {
      capabilities.details.intel.forEach(gpu => console.log(`     - ${gpu}`));
    }

    console.log('\n🔧 Encoder Support:');
    console.log(`   NVENC (NVIDIA): ${capabilities.nvencSupport ? '✅' : '❌'}`);
    console.log(`   VAAPI (AMD/Intel): ${capabilities.vaapiSupport ? '✅' : '❌'}`);
    console.log(`   QuickSync (Intel): ${capabilities.qsvSupport ? '✅' : '❌'}`);
    
    console.log(`\n🚀 Recommended Encoder: ${capabilities.recommendedEncoder}`);
    
    if (capabilities.recommendedEncoder === 'libx264') {
      console.log('   ℹ️  Using CPU encoding - consider installing GPU drivers for faster conversion');
    } else {
      console.log('   🎉 GPU acceleration available!');
    }
  }

  /**
   * Test GPU encoder with a sample conversion
   */
  async testEncoder(encoder: string): Promise<boolean> {
    console.log(`🧪 Testing ${encoder} encoder...`);
    
    try {
      // Create a test pattern video and try to encode it
      const testArgs = [
        '-f', 'lavfi',
        '-i', 'testsrc=duration=1:size=320x240:rate=1',
        '-c:v', encoder,
        '-t', '1',
        '-f', 'null',
        '-'
      ];

      await this.runCommand('ffmpeg', testArgs);
      console.log(`✅ ${encoder} test successful`);
      return true;
    } catch (error) {
      console.log(`❌ ${encoder} test failed:`, error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /**
   * Run a command and return its output
   */
  private runCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args);
      let output = '';
      let errorOutput = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`${command} failed with code ${code}: ${errorOutput}`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }
}

// CLI usage
if (require.main === module) {
  const detector = new GPUDetector();
  
  async function main() {
    try {
      const capabilities = await detector.detectCapabilities();
      
      // Test the recommended encoder if it's not CPU
      if (capabilities.recommendedEncoder !== 'libx264') {
        console.log('\n🧪 Testing recommended encoder...');
        const testResult = await detector.testEncoder(capabilities.recommendedEncoder);
        
        if (!testResult) {
          console.log('⚠️  Recommended encoder failed test, falling back to CPU encoding');
        }
      }
      
      console.log('\n💡 Usage:');
      console.log('   npm run convert-to-hls:gpu     # Use GPU acceleration');
      console.log('   npm run convert-to-hls         # Use CPU encoding');
      
    } catch (error) {
      console.error('GPU detection failed:', error);
      process.exit(1);
    }
  }

  main();
}

export default GPUDetector;
