import { NextFunction, Request, Response, Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validate';
import { createRateLimitStore } from '../middleware/rateLimitStore';
import { AppError } from '../utils/AppError';
import * as admin from './admin.service';

// The owner's admin panel API, under /admin/api. Every route except sign-in
// needs a signed-in account listed in admin_users. Nothing here is cached.

export const adminRouter = Router();

adminRouter.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
});

// Sign-in attempts are few by nature; this stops password guessing.
const signInLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    store: createRateLimitStore('admin:signin'),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
    message: { status: 'error', message: 'Demasiados intentos. Espera unos minutos.' },
});

const handle = (work: (req: Request) => Promise<unknown>) =>
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            res.json(await work(req));
        } catch (error) {
            next(error);
        }
    };

export async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
        if (!req.user || !(await admin.isAdmin(req.user.id))) {
            next(new AppError('Esta cuenta no tiene acceso a la administración', 403));
            return;
        }
        next();
    } catch (error) {
        next(error);
    }
}

const signInSchema = z.object({
    body: z.object({ email: z.string().trim().email().max(200), password: z.string().min(1).max(200) }),
});
const refreshSchema = z.object({ body: z.object({ refreshToken: z.string().min(10).max(2000) }) });
const userParams = z.object({ id: z.string().uuid() });
const usersQuery = z.object({
    query: z.object({
        filter: z.enum(['all', 'online', 'trial', 'ending', 'expired', 'paid', 'free', 'suspended']).optional(),
        search: z.string().max(80).optional(),
        page: z.coerce.number().int().min(0).max(10000).optional(),
    }),
});

adminRouter.post('/login', signInLimiter, validateRequest(signInSchema),
    handle((req) => admin.signIn(req.body.email, req.body.password)));
adminRouter.post('/refresh', signInLimiter, validateRequest(refreshSchema),
    handle((req) => admin.refresh(req.body.refreshToken)));

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/overview', handle(() => admin.overview()));
adminRouter.get('/users', validateRequest(usersQuery),
    handle((req) => admin.listUsers(req.query as any)));
adminRouter.get('/users/:id', validateRequest(z.object({ params: userParams })),
    handle((req) => admin.userDetail(req.params.id as string)));
adminRouter.post('/users/:id/extend-trial',
    validateRequest(z.object({ params: userParams, body: z.object({ days: z.number().int().min(1).max(365) }) })),
    handle((req) => admin.extendTrial(req.user!.id, req.params.id as string, req.body.days)));
adminRouter.post('/users/:id/plan',
    validateRequest(z.object({ params: userParams, body: z.object({ plan: z.enum(['trial', 'free_access']) }) })),
    handle((req) => admin.setPlan(req.user!.id, req.params.id as string, req.body.plan)));
adminRouter.post('/users/:id/suspend',
    validateRequest(z.object({ params: userParams, body: z.object({ suspended: z.boolean() }) })),
    handle((req) => admin.setSuspended(req.user!.id, req.params.id as string, req.body.suspended)));
adminRouter.post('/users/:id/notice',
    validateRequest(z.object({
        params: userParams,
        body: z.object({ title: z.string().trim().min(1).max(60), body: z.string().trim().min(1).max(240) }),
    })),
    handle((req) => admin.sendNotice(req.user!.id, req.params.id as string, req.body.title, req.body.body)));

adminRouter.get('/plans', handle(() => admin.plans()));

adminRouter.get('/errors', validateRequest(z.object({ query: z.object({ days: z.coerce.number().int().min(1).max(90).optional() }) })),
    handle((req) => admin.errorGroupsSince(new Date(Date.now() - Number((req.query as any).days ?? 7) * 86_400_000).toISOString())));
adminRouter.get('/errors/:fingerprint', validateRequest(z.object({ params: z.object({ fingerprint: z.string().regex(/^[0-9a-f]{32}$/) }) })),
    handle((req) => admin.errorDetail(req.params.fingerprint as string)));
adminRouter.post('/errors/:fingerprint/resolve',
    validateRequest(z.object({ params: z.object({ fingerprint: z.string().regex(/^[0-9a-f]{32}$/) }), body: z.object({ resolved: z.boolean() }) })),
    handle((req) => admin.resolveError(req.params.fingerprint as string, req.body.resolved)));

adminRouter.get('/feedback', handle(() => admin.feedbackAndReports()));
adminRouter.post('/reports/:id/status',
    validateRequest(z.object({ params: userParams, body: z.object({ status: z.enum(['open', 'reviewed', 'dismissed']) }) })),
    handle((req) => admin.setReportStatus(req.params.id as string, req.body.status)));

adminRouter.get('/assistant', handle(() => admin.assistantUsage()));
adminRouter.get('/system', handle(() => admin.system()));

adminRouter.get('/settings', handle(() => admin.getSettings()));
adminRouter.put('/settings',
    validateRequest(z.object({
        body: z.object({
            trialDays: z.number().int().min(1).max(365),
            noticeDays: z.array(z.number().int().min(1).max(60)).max(5),
            monthlyPriceClp: z.number().int().min(0).max(10_000_000).nullable(),
            annualPriceClp: z.number().int().min(0).max(10_000_000).nullable(),
        }),
    })),
    handle((req) => admin.updateSettings(req.body)));
