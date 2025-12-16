// Navigation functionality module

import { elements } from './constants.js';

/**
 * Initialize navigation functionality
 */
function initNavigation() {
    if (!elements.navItems || !elements.sections) {
        console.warn('Navigation elements not found');
        return;
    }

    elements.navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const sectionId = item.dataset.section;

            // Update navigation state
            elements.navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Show corresponding section
            elements.sections.forEach(section => {
                section.classList.remove('active');
                if (section.id === sectionId) {
                    section.classList.add('active');
                }
            });
        });
    });
}

/**
 * Switch to specified section
 * @param {string} sectionId - Section ID
 */
function switchToSection(sectionId) {
    // Update navigation state
    elements.navItems.forEach(nav => {
        nav.classList.remove('active');
        if (nav.dataset.section === sectionId) {
            nav.classList.add('active');
        }
    });

    // Show corresponding section
    elements.sections.forEach(section => {
        section.classList.remove('active');
        if (section.id === sectionId) {
            section.classList.add('active');
        }
    });
}

/**
 * Switch to dashboard page
 */
function switchToDashboard() {
    switchToSection('dashboard');
}

/**
 * Switch to providers page
 */
function switchToProviders() {
    switchToSection('providers');
}

export {
    initNavigation,
    switchToSection,
    switchToDashboard,
    switchToProviders
};