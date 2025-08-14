# Resume Matcher Application

## Overview

This is a full-stack web application that uses AI to match resumes with job descriptions. The system allows users to upload job descriptions and multiple resume files (PDF, DOC, DOCX), then uses OpenAI's API to analyze and score how well each candidate matches the job requirements. The application provides a modern, responsive interface for HR professionals and recruiters to streamline their candidate evaluation process.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript for type safety and better developer experience
- **Build Tool**: Vite for fast development and optimized production builds
- **UI Framework**: shadcn/ui components built on top of Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens and CSS variables for theming
- **State Management**: TanStack Query for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation for type-safe form management

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript for full-stack type safety
- **API Design**: RESTful API with structured error handling and logging middleware
- **File Processing**: Multer for multipart file uploads with memory storage
- **Document Processing**: PDF parsing via pdf-parse library and Word document processing via mammoth
- **AI Integration**: OpenAI API for resume analysis and job matching using GPT models

### Data Storage Solutions
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Schema Management**: Drizzle migrations for database version control
- **Development Storage**: In-memory storage implementation for rapid development and testing
- **Connection**: Neon serverless PostgreSQL for cloud deployment

### Authentication and Authorization
- **Session Management**: Express sessions with PostgreSQL session store (connect-pg-simple)
- **Security**: CORS configuration and credential-based authentication

### External Dependencies
- **AI Service**: OpenAI API for natural language processing and resume-job matching analysis
- **Database**: Neon PostgreSQL serverless database for production data persistence
- **UI Components**: Radix UI primitives for accessible, unstyled component foundations
- **File Processing**: Support for PDF, DOC, and DOCX file formats with automatic text extraction
- **Development Tools**: Replit integration with hot reload and error overlay for development environment