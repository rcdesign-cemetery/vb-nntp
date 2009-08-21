#
#   Copyright © 2008, Dmitry Titov, Vitaly Puzrin
#   http://wildev.ru, http://rcdesign.ru
#
# ==============================================================================
#

  package RCD::NNTP::Plugins::NEWNEWS;

    #
    #   NEWNEWS handler
    #

    use strict;
    use base qw(RCD::NNTP::Base::Plugin);

    our $VERSION = "0.01"; # $Date: 2008/07/20 12:10:56 $


    sub init
    {
      my $self = shift;

      #
      #   Commands handled by this module
      #

      $self->{COMMANDS} = {
          # command => sub
          'newnews' => 'cmd_newnews',
        };

      1;
    }


    #   ========================================================================
    #
    #     RFC 977
    #     http://www.faqs.org/rfcs/rfc977.html
    #
    #   ------------------------------------------------------------------------
    #
    #   3.8.  The NEWNEWS command
    #
    #   3.8.1.  NEWNEWS
    #
    #      NEWNEWS newsgroups date time [GMT] [<distribution>]
    #
    #      A list of message-ids of articles posted or received to the specified
    #      newsgroup since "date" will be listed. The format of the listing will
    #      be one message-id per line, as though text were being sent.  A single
    #      line consisting solely of one period followed by CR-LF will terminate
    #      the list.
    #
    #      Date and time are in the same format as the NEWGROUPS command.
    #
    #      A newsgroup name containing a "*" (an asterisk) may be specified to
    #      broaden the article search to some or all newsgroups.  The asterisk
    #      will be extended to match any part of a newsgroup name (e.g.,
    #      net.micro* will match net.micro.wombat, net.micro.apple, etc). Thus
    #      if only an asterisk is given as the newsgroup name, all newsgroups
    #      will be searched for new news.
    #
    #      (Please note that the asterisk "*" expansion is a general
    #      replacement; in particular, the specification of e.g., net.*.unix
    #      should be correctly expanded to embrace names such as net.wombat.unix
    #      and net.whocares.unix.)
    #
    #      Conversely, if no asterisk appears in a given newsgroup name, only
    #      the specified newsgroup will be searched for new articles. Newsgroup
    #      names must be chosen from those returned in the listing of available
    #      groups.  Multiple newsgroup names (including a "*") may be specified
    #      in this command, separated by a comma.  No comma shall appear after
    #      the last newsgroup in the list.  [Implementors are cautioned to keep
    #      the 512 character command length limit in mind.]
    #
    #      The exclamation point ("!") may be used to negate a match. This can
    #      be used to selectively omit certain newsgroups from an otherwise
    #      larger list.  For example, a newsgroups specification of
    #      "net.*,mod.*,!mod.map.*" would specify that all net.<anything> and
    #      all mod.<anything> EXCEPT mod.map.<anything> newsgroup names would be
    #      matched.  If used, the exclamation point must appear as the first
    #      character of the given newsgroup name or pattern.
    #
    #      The optional parameter "distributions" is a list of distribution
    #      groups, enclosed in angle brackets.  If specified, the distribution
    #      portion of an article's newsgroup (e.g, 'net' in 'net.wombat') will
    #      be examined for a match with the distribution categories listed, and
    #      only those articles which have at least one newsgroup belonging to
    #      the list of distributions will be listed.  If more than one
    #      distribution group is to be supplied, they must be separated by
    #      commas within the angle brackets.
    #
    #      The use of the IHAVE, NEWNEWS, and NEWGROUPS commands to distribute
    #      news is discussed in an earlier part of this document.
    #
    #      Please note that an empty list (i.e., the text body returned by this
    #      command consists only of the terminating period) is a possible valid
    #      response, and indicates that there is currently no new news.
    #
    #   3.8.2.  Responses
    #
    #      230 list of new articles by message-id follows
    #


    sub cmd_newnews
    {
      my $self = shift;

      my ( $uuid, $groups, $date, $time, $gmt, $dists ) = @_;

      if( $self->checkauth( $uuid ) )
      {
        $dists   =
          ( $dists && $dists =~ /^\<[^\>]*\>$/ ) ? $dists :
          ( $gmt   && $gmt   =~ /^\<[^\>]*\>$/ ) ? $gmt   : undef;

        $gmt     = $gmt eq 'GMT'
          ? $gmt
          : '';

        my $date = $self->parse_date_time( $date, $time, $gmt );

        $dists =~ s/^\<//;
        $dists =~ s/\>$//;
        $dists =  defined( $dists ) ? [ split( ',', $dists ) ] : [];

        $groups = [ split( ',', $groups ) ];

        my $messages = $self->forum( $uuid )->do( {
            do            => 'messageslist',
            auth_ok       => 'yes',
            nntp_username => $self->client( $uuid )->{username},
            nntp_userid   => $self->client( $uuid )->{userid}  ,
            access        => $self->client( $uuid )->{access}  ,
            sdata         => {
                groups        => $groups,
                date          => $date,
                distributions => $dists,
              },
          } );

        if( ref( $messages ) eq 'ARRAY' )
        {
          $self->WriteClient(
              $uuid,
              '230 list of new articles by message-id follows'
            );

          foreach my $m ( @{$messages} )
          {
            #
            #   Print message id
            #

            $self->WriteClient(
                $uuid,
                $self->build_message_id(
                    $m->{groupid}   ,
                    $m->{messageid} ,
                    $m->{gateid}    ,
                  ),
              );
          }

          $self->WriteClient(
              $uuid,
              '.'
            );
        }
        else
        {
          #
          #   server error, inform client
          #

          $self->WriteClient(
              $uuid,
              '503 program fault - command not performed'
            );
        }
      }

      return;
    }


# end of the RCD::NNTP::Plugins::NEWNEWS package

1;
