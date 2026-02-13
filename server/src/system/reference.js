import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auditFromRequest } from '../systemMiddleware.js';
import { requireSystemRole, requireSystemPermission } from '../systemMiddleware.js';

const router = express.Router();

const departmentSchema = z.object({ name: z.string().min(1), code: z.string().optional().nullable(), isActive: z.boolean().optional() });
const siteSchema = z.object({ name: z.string().min(1), code: z.string().optional().nullable(), isActive: z.boolean().optional() });
const jobTitleSchema = z.object({ name: z.string().min(1), isActive: z.boolean().optional() });

// ---- Departments ----
router.get('/departments', requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'), async (_req, res) => {
  try {
    const list = await prisma.department.findMany({ orderBy: { name: 'asc' } });
    res.json({ departments: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list departments' });
  }
});

router.post('/departments', requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'), requireSystemPermission('system:reference:update'), async (req, res) => {
  try {
    const body = departmentSchema.parse(req.body);
    const dept = await prisma.department.create({
      data: { name: body.name.trim(), code: body.code?.trim() || null, isActive: body.isActive ?? true },
    });
    await auditFromRequest(req, { action: 'DEPARTMENT_CREATED', entityType: 'Department', entityId: dept.id, afterValue: dept, reason: req.body.reason });
    res.status(201).json({ department: dept });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: 'Failed to create department' });
  }
});

router.put('/departments/:id', requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'), requireSystemPermission('system:reference:update'), async (req, res) => {
  try {
    const body = departmentSchema.parse(req.body);
    const existing = await prisma.department.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Department not found' });
    const updated = await prisma.department.update({
      where: { id: req.params.id },
      data: { name: body.name.trim(), code: body.code?.trim() || null, isActive: body.isActive ?? existing.isActive },
    });
    await auditFromRequest(req, { action: 'DEPARTMENT_UPDATED', entityType: 'Department', entityId: updated.id, beforeValue: existing, afterValue: updated, reason: req.body.reason });
    res.json({ department: updated });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: 'Failed to update department' });
  }
});

// ---- Sites ----
router.get('/sites', requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'), async (_req, res) => {
  try {
    const list = await prisma.site.findMany({ orderBy: { name: 'asc' } });
    res.json({ sites: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list sites' });
  }
});

router.post('/sites', requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'), requireSystemPermission('system:reference:update'), async (req, res) => {
  try {
    const body = siteSchema.parse(req.body);
    const site = await prisma.site.create({
      data: { name: body.name.trim(), code: body.code?.trim() || null, isActive: body.isActive ?? true },
    });
    await auditFromRequest(req, { action: 'SITE_CREATED', entityType: 'Site', entityId: site.id, afterValue: site, reason: req.body.reason });
    res.status(201).json({ site });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: 'Failed to create site' });
  }
});

router.put('/sites/:id', requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'), requireSystemPermission('system:reference:update'), async (req, res) => {
  try {
    const body = siteSchema.parse(req.body);
    const existing = await prisma.site.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Site not found' });
    const updated = await prisma.site.update({
      where: { id: req.params.id },
      data: { name: body.name.trim(), code: body.code?.trim() || null, isActive: body.isActive ?? existing.isActive },
    });
    await auditFromRequest(req, { action: 'SITE_UPDATED', entityType: 'Site', entityId: updated.id, beforeValue: existing, afterValue: updated, reason: req.body.reason });
    res.json({ site: updated });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: 'Failed to update site' });
  }
});

// ---- Job titles ----
router.get('/job-titles', requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'), async (_req, res) => {
  try {
    const list = await prisma.jobTitle.findMany({ orderBy: { name: 'asc' } });
    res.json({ jobTitles: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list job titles' });
  }
});

router.post('/job-titles', requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'), requireSystemPermission('system:reference:update'), async (req, res) => {
  try {
    const body = jobTitleSchema.parse(req.body);
    const jobTitle = await prisma.jobTitle.create({
      data: { name: body.name.trim(), isActive: body.isActive ?? true },
    });
    await auditFromRequest(req, { action: 'JOB_TITLE_CREATED', entityType: 'JobTitle', entityId: jobTitle.id, afterValue: jobTitle, reason: req.body.reason });
    res.status(201).json({ jobTitle });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: 'Failed to create job title' });
  }
});

router.put('/job-titles/:id', requireSystemRole('System Admin', 'Admin', 'Quality Admin', 'Quality Manager'), requireSystemPermission('system:reference:update'), async (req, res) => {
  try {
    const body = jobTitleSchema.parse(req.body);
    const existing = await prisma.jobTitle.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Job title not found' });
    const updated = await prisma.jobTitle.update({
      where: { id: req.params.id },
      data: { name: body.name.trim(), isActive: body.isActive ?? existing.isActive },
    });
    await auditFromRequest(req, { action: 'JOB_TITLE_UPDATED', entityType: 'JobTitle', entityId: updated.id, beforeValue: existing, afterValue: updated, reason: req.body.reason });
    res.json({ jobTitle: updated });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: 'Failed to update job title' });
  }
});

export default router;
