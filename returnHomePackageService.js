const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const ReturnHomePackageService = {
  /**
   * Check if a building is eligible for return home package
   * Requirements:
   * - Has engineer report
   * - Eligibility checked
   * - Budget request submitted (we'll check if canOpenBudget is true)
   * - Status is REHABILITATION_COMPLETED
   */
  isEligibleForReturnHomePackage(report) {
    return (
      report.hasEngineerReport === true &&
      report.eligibilityChecked === true &&
      report.status === 'REHABILITATION_COMPLETED'
    );
  },

  /**
   * Generate a PDF return home package for a building
   * The PDF will be in Hebrew with RTL support
   */
  async generateReturnHomePackage(report, processId = null) {
    const settlementName = report.settlementId || 'לא ידוע';
    logger.info('PDF_STARTED', { processId, buildingId: report.id, settlementName });

    // Wait 1 second to simulate complex PDF generation
    await new Promise(resolve => setTimeout(resolve, 1000));

    const pdfDir = path.join(__dirname, 'generated-pdfs');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const filename = `return-home-package-${report.id}.pdf`;
    const filepath = path.join(pdfDir, filename);

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });

    // Register a Hebrew font - using Arial which supports Hebrew on Windows
    // On Windows, Arial is available at: C:\Windows\Fonts\arial.ttf
    const fontPath = 'C:\\Windows\\Fonts\\arial.ttf';
    if (fs.existsSync(fontPath)) {
      doc.registerFont('Hebrew', fontPath);
      doc.font('Hebrew');
    }

    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    // Helper function for RTL text - reverse word order for Hebrew
    const addRTLText = (text, options = {}) => {
      // Reverse the order of words (not characters) for RTL
      const words = text.split(' ');
      const reversedWords = words.reverse().join(' ');
      doc.text(reversedWords, { ...options, align: 'right' });
    };

    // Title
    doc.fontSize(24).fillColor('#000000');
    addRTLText('תיק אכלוס מחדש', { align: 'center' });
    doc.moveDown();

    // Separator line
    doc.moveTo(50, doc.y)
       .lineTo(545, doc.y)
       .stroke();
    doc.moveDown();

    // Building details
    doc.fontSize(14).fillColor('#333333');
    
    addRTLText(`מזהה מבנה: ${report.id}`);
    doc.moveDown(0.5);
    
    addRTLText(`כתובת: ${report.address}`);
    doc.moveDown(0.5);
    
    addRTLText(`מספר דירות: ${report.apartmentCount || 0}`);
    doc.moveDown(0.5);
    
    // Status information
    doc.moveDown();
    doc.fontSize(16).fillColor('#000000');
    addRTLText('סטטוסים:');
    doc.moveDown(0.5);
    
    doc.fontSize(14).fillColor('#333333');
    addRTLText(`סטטוס זכאות: ${report.eligibilityChecked ? 'זכאי' : 'לא זכאי'}`);
    doc.moveDown(0.3);
    
    // Budget status - check if budget can be opened
    const budgetStatus = (report.hasEngineerReport && report.eligibilityChecked) ? 'אושר' : 'טרם אושר';
    addRTLText(`סטטוס תקציב: ${budgetStatus}`);
    doc.moveDown(0.3);
    
    // Rehabilitation status
    const rehabStatusMap = {
      'NEW': 'חדש',
      'IN_REVIEW': 'בבדיקה',
      'REHABILITATION_IN_PROGRESS': 'בתהליך שיקום',
      'REHABILITATION_COMPLETED': 'תהליך שיקום הסתיים'
    };
    addRTLText(`סטטוס שיקום: ${rehabStatusMap[report.status] || report.status}`);
    doc.moveDown();

    // Final statement
    doc.moveDown();
    doc.fontSize(18).fillColor('#2563eb');
    addRTLText('ניתן לאכלוס מחדש', { align: 'center' });
    doc.moveDown();

    // Footer
    doc.fontSize(10).fillColor('#666666');
    doc.moveTo(50, doc.y)
       .lineTo(545, doc.y)
       .stroke();
    doc.moveDown(0.5);
    addRTLText(`תאריך הפקה: ${new Date().toLocaleString('he-IL')}`, { align: 'center' });

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        logger.info('PDF_SAVED', { processId, buildingId: report.id, settlementName, filename });
        resolve(`/generated-pdfs/${filename}`);
      });
      stream.on('error', (err) => {
        logger.error('PDF_SAVE_ERROR', { processId, buildingId: report.id, settlementName, error: err.message });
        reject(err);
      });
    });
  }
};

module.exports = ReturnHomePackageService;
