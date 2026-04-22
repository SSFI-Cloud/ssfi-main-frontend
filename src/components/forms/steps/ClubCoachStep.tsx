'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRegistrationStore } from '@/lib/store/registrationStore';
import { useStates, useDistricts, useClubs } from '@/lib/hooks/useStudent';
import { GraduationCap } from 'lucide-react';

// Canonical skate-category list offered during registration. Backend
// will resolve the label to CategoryType.id (creating the row if it
// doesn't exist yet) so this is the single source of truth.
export const SKATE_CATEGORY_OPTIONS = [
  'Speed Quad',
  'Speed Inline',
  'Recreational',
  'Beginner',
] as const;

const schema = z.object({
  stateId: z.string().min(1, 'State is required'),
  districtId: z.string().min(1, 'District is required'),
  clubId: z.string().min(1, 'Club is required'),
  clubMode: z.enum(['club', 'school']).optional(),
  coachName: z.string().optional(),
  coachPhone: z.string().optional(),
  skateCategory: z.string().min(1, 'Please pick a skate category'),
});
type FormData = z.infer<typeof schema>;

const inputCls = (err?: boolean) =>
  `w-full px-4 py-3 border rounded-xl text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:border-green-500 text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${err ? 'border-red-400 focus:ring-red-400/20' : 'border-gray-200 focus:ring-green-500/20'}`;

export default function ClubCoachStep({ onComplete }: { onComplete: (data: FormData) => void }) {
  const { formData, updateFormData } = useRegistrationStore();
  const [selectedState, setSelectedState] = useState(formData.stateId || '');
  const [selectedDistrict, setSelectedDistrict] = useState(formData.districtId || '');
  const [clubMode, setClubMode] = useState<'club' | 'school'>((formData as any).clubMode || 'club');

  const { fetchStates, data: states, isLoading: statesLoading } = useStates();
  const { fetchDistricts, data: districts, isLoading: districtsLoading, clearDistricts } = useDistricts();
  const { fetchClubs, data: clubs, isLoading: clubsLoading, clearClubs } = useClubs();

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      stateId: formData.stateId || '',
      districtId: formData.districtId || '',
      clubId: formData.clubId || '',
      clubMode: (formData as any).clubMode || 'club',
      coachName: formData.coachName || '',
      coachPhone: formData.coachPhone || '',
      skateCategory: (formData as any).skateCategory || '',
    },
  });

  const watchState = watch('stateId');
  const watchDistrict = watch('districtId');

  useEffect(() => { fetchStates(); }, [fetchStates]);

  useEffect(() => {
    if (watchState !== selectedState) {
      setSelectedState(watchState);
      setValue('districtId', '');
      // In 'school' mode the clubId is derived from the Step 2 school
      // name and is independent of the state/district cascade, so don't
      // clobber it here — otherwise toggling School + then picking a
      // state/district wipes the school: placeholder and blocks Next.
      if (clubMode !== 'school') setValue('clubId', '');
      setSelectedDistrict('');
      if (watchState) fetchDistricts(watchState); else clearDistricts();
    }
  }, [watchState]);

  useEffect(() => {
    if (watchDistrict !== selectedDistrict) {
      setSelectedDistrict(watchDistrict);
      if (clubMode !== 'school') setValue('clubId', '');
      if (watchDistrict) fetchClubs(watchDistrict); else clearClubs();
    }
  }, [watchDistrict]);

  // When school mode is selected, auto-set clubId to "school" placeholder.
  // Also re-run whenever state/district change so any watchState /
  // watchDistrict reset above is immediately restored.
  useEffect(() => {
    if (clubMode === 'school') {
      const schoolName = formData.schoolName;
      if (schoolName) {
        setValue('clubId', `school:${schoolName}`);
      }
    }
    setValue('clubMode', clubMode);
  }, [clubMode, formData.schoolName, watchState, watchDistrict]);

  const onSubmit = (data: FormData) => { updateFormData({ ...data, clubMode }); onComplete(data); };

  return (
    <form id="step-4-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/*
        Club is the default path. The separate "School" mode the form
        used to offer (big Building2 / GraduationCap toggle at the top)
        has been folded into a single checkbox below the club dropdown
        — when the skater doesn't belong to a registered club, tick
        the box and the school name from Step 2 is carried through as
        the club. Same underlying logic, fewer clicks.
      */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">State <span className="text-red-400">*</span></label>
          <select {...register('stateId')} disabled={statesLoading} className={inputCls(!!errors.stateId)}>
            <option value="">{statesLoading ? 'Loading...' : 'Select state'}</option>
            {states?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {errors.stateId && <p className="mt-1 text-xs text-red-500">{errors.stateId.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">District <span className="text-red-400">*</span></label>
          <select {...register('districtId')} disabled={!selectedState || districtsLoading} className={inputCls(!!errors.districtId)}>
            <option value="">{districtsLoading ? 'Loading...' : !selectedState ? 'Select state first' : 'Select district'}</option>
            {districts?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {errors.districtId && <p className="mt-1 text-xs text-red-500">{errors.districtId.message}</p>}
        </div>

        {clubMode === 'club' ? (
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Club <span className="text-red-400">*</span></label>
            <select {...register('clubId')} disabled={!selectedDistrict || clubsLoading} className={inputCls(!!errors.clubId)}>
              <option value="">{clubsLoading ? 'Loading...' : !selectedDistrict ? 'Select district first' : 'Select club'}</option>
              {clubs?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {errors.clubId && <p className="mt-1 text-xs text-red-500">{errors.clubId.message}</p>}
          </div>
        ) : (
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">School Name</label>
            <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 font-medium flex items-center gap-2">
              <GraduationCap className="w-4 h-4 flex-shrink-0" />
              <span>{formData.schoolName || 'Please enter school name in Step 2 (Family & School)'}</span>
            </div>
            <input type="hidden" {...register('clubId')} />
            <p className="mt-1 text-xs text-gray-500">Your school name from Step 2 is being used as your club.</p>
          </div>
        )}

        {/* "I don't belong to a club" checkbox. Lives under the club
            picker so it reads left-to-right: try to pick a club first,
            tick this only if none applies. Flipping the checkbox
            toggles `clubMode` which the existing useEffect above uses
            to auto-populate clubId with `school:<schoolName>`. */}
        <div className="md:col-span-2">
          <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50 cursor-pointer hover:border-amber-300 hover:bg-amber-50/40 transition-colors">
            <input
              type="checkbox"
              checked={clubMode === 'school'}
              onChange={(e) => {
                const next = e.target.checked ? 'school' : 'club';
                setClubMode(next);
                // Clear clubId only when flipping INTO club mode; the
                // school branch is repopulated by the existing effect.
                if (next === 'club') setValue('clubId', '');
              }}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-400"
            />
            <div className="flex-1">
              <span className="block text-sm font-medium text-gray-800">
                My child doesn't belong to a registered club — register under their school instead
              </span>
              <span className="block text-xs text-gray-500 mt-0.5">
                The school name you entered in Step 2 will be used as the club. Only tick this if no affiliated club appears in the list above.
              </span>
            </div>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Coach Name <span className="text-gray-400">(Optional)</span></label>
          <input {...register('coachName')} placeholder="Coach's full name" className={inputCls()} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Coach Phone <span className="text-gray-400">(Optional)</span></label>
          <input {...register('coachPhone')} type="tel" maxLength={10} placeholder="10-digit number" className={inputCls()} />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Skate Category <span className="text-red-400">*</span>
          </label>
          <select {...register('skateCategory')} className={inputCls(!!errors.skateCategory)}>
            <option value="">Select skate category</option>
            {SKATE_CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {errors.skateCategory && <p className="mt-1 text-xs text-red-500">{errors.skateCategory.message}</p>}
          <p className="mt-1 text-xs text-gray-500">Which discipline do you intend to participate in?</p>
        </div>
      </div>
    </form>
  );
}
