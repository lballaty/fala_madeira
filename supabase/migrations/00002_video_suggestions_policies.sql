-- Update video_suggestions policies to allow everyone to see approved suggestions
-- and allow admins to update suggestions.

-- Allow everyone to view approved suggestions
CREATE POLICY "Anyone can view approved suggestions" 
ON public.video_suggestions 
FOR SELECT 
USING (status = 'approved');

-- Allow admins to update suggestions
CREATE POLICY "Admins can update suggestions" 
ON public.video_suggestions 
FOR UPDATE 
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');
